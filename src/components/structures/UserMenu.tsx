/*
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { createRef } from "react";
import { Room } from "matrix-js-sdk/src/models/room";

import { MatrixClientPeg } from "../../MatrixClientPeg";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { ActionPayload } from "../../dispatcher/payloads";
import { Action } from "../../dispatcher/actions";
import { _t } from "../../languageHandler";
import { ChevronFace, ContextMenuButton } from "./ContextMenu";
import { UserTab } from "../views/dialogs/UserTab";
import { OpenToTabPayload } from "../../dispatcher/payloads/OpenToTabPayload";
import FeedbackDialog from "../views/dialogs/FeedbackDialog";
import Modal from "../../Modal";
import LogoutDialog from "../views/dialogs/LogoutDialog";
import SettingsStore from "../../settings/SettingsStore";
import {
    RovingAccessibleTooltipButton,
} from "../../accessibility/RovingTabIndex";
import AccessibleButton, { ButtonEvent } from "../views/elements/AccessibleButton";
import SdkConfig from "../../SdkConfig";
import { getHomePageUrl } from "../../utils/pages";
import { OwnProfileStore } from "../../stores/OwnProfileStore";
import { UPDATE_EVENT } from "../../stores/AsyncStore";
import BaseAvatar from '../views/avatars/BaseAvatar';
import { SettingLevel } from "../../settings/SettingLevel";
import IconizedContextMenu, {
    IconizedContextMenuOption,
    IconizedContextMenuOptionList,
} from "../views/context_menus/IconizedContextMenu";
import { UIFeature } from "../../settings/UIFeature";
import HostSignupAction from "./HostSignupAction";
import SpaceStore from "../../stores/spaces/SpaceStore";
import { UPDATE_SELECTED_SPACE } from "../../stores/spaces";
import { Theme } from "../../settings/enums/Theme";
import UserIdentifierCustomisations from "../../customisations/UserIdentifier";
import PosthogTrackers from "../../PosthogTrackers";
import { ViewHomePagePayload } from "../../dispatcher/payloads/ViewHomePagePayload";

interface IProps {
    isPanelCollapsed: boolean;
}

type PartialDOMRect = Pick<DOMRect, "width" | "left" | "top" | "height">;

interface IState {
    contextMenuPosition: PartialDOMRect;
    themeInUse: Theme;
    selectedSpace?: Room;
}

const toRightOf = (rect: PartialDOMRect) => {
    return {
        left: rect.width + rect.left + 8,
        top: rect.top,
        chevronFace: ChevronFace.None,
    };
};

const below = (rect: PartialDOMRect) => {
    return {
        left: rect.left,
        top: rect.top + rect.height,
        chevronFace: ChevronFace.None,
    };
};

export default class UserMenu extends React.Component<IProps, IState> {
    private dispatcherRef: string;
    private themeInUseWatcherRef: string;
    private readonly dndWatcherRef: string;
    private buttonRef: React.RefObject<HTMLButtonElement> = createRef();

    constructor(props: IProps) {
        super(props);

        this.state = {
            contextMenuPosition: null,
            themeInUse: SettingsStore.getValue("theme_in_use"),
            selectedSpace: SpaceStore.instance.activeSpaceRoom,
        };

        OwnProfileStore.instance.on(UPDATE_EVENT, this.onProfileUpdate);
        SpaceStore.instance.on(UPDATE_SELECTED_SPACE, this.onSelectedSpaceUpdate);
    }

    private get hasHomePage(): boolean {
        return !!getHomePageUrl(SdkConfig.get());
    }

    public componentDidMount() {
        this.dispatcherRef = defaultDispatcher.register(this.onAction);
        this.themeInUseWatcherRef = SettingsStore.watchSetting("theme_in_use", null, this.onThemeInUseChanged);
    }

    public componentWillUnmount() {
        if (this.themeInUseWatcherRef) SettingsStore.unwatchSetting(this.themeInUseWatcherRef);
        if (this.dndWatcherRef) SettingsStore.unwatchSetting(this.dndWatcherRef);
        if (this.dispatcherRef) defaultDispatcher.unregister(this.dispatcherRef);
        OwnProfileStore.instance.off(UPDATE_EVENT, this.onProfileUpdate);
        SpaceStore.instance.off(UPDATE_SELECTED_SPACE, this.onSelectedSpaceUpdate);
    }

    private onProfileUpdate = async () => {
        // the store triggered an update, so force a layout update. We don't
        // have any state to store here for that to magically happen.
        this.forceUpdate();
    };

    private onSelectedSpaceUpdate = async () => {
        this.setState({
            selectedSpace: SpaceStore.instance.activeSpaceRoom,
        });
    };

    private onThemeInUseChanged = () => {
        this.setState({ themeInUse: SettingsStore.getValue("theme_in_use") });
    };

    private onAction = (payload: ActionPayload) => {
        switch (payload.action) {
            case Action.ToggleUserMenu:
                if (this.state.contextMenuPosition) {
                    this.setState({ contextMenuPosition: null });
                } else {
                    if (this.buttonRef.current) this.buttonRef.current.click();
                }
                break;
        }
    };

    private onOpenMenuClick = (ev: React.MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.setState({ contextMenuPosition: ev.currentTarget.getBoundingClientRect() });
    };

    private onContextMenu = (ev: React.MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.setState({
            contextMenuPosition: {
                left: ev.clientX,
                top: ev.clientY,
                width: 20,
                height: 0,
            },
        });
    };

    private onCloseMenu = () => {
        this.setState({ contextMenuPosition: null });
    };

    private onSwitchThemeClick = (ev: React.MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();

        const newTheme = this.state.themeInUse === Theme.Dark ? Theme.Light : Theme.Dark;
        SettingsStore.setValue("theme_in_use", null, SettingLevel.DEVICE, newTheme); // set at same level as Appearance tab
        PosthogTrackers.trackInteraction("WebUserMenuThemeToggleButton", ev);
    };

    private onSettingsOpen = (ev: ButtonEvent, tabId: string) => {
        ev.preventDefault();
        ev.stopPropagation();

        const payload: OpenToTabPayload = { action: Action.ViewUserSettings, initialTabId: tabId };
        defaultDispatcher.dispatch(payload);
        this.setState({ contextMenuPosition: null }); // also close the menu
    };

    private onProvideFeedback = (ev: ButtonEvent) => {
        ev.preventDefault();
        ev.stopPropagation();

        Modal.createTrackedDialog('Feedback Dialog', '', FeedbackDialog);
        this.setState({ contextMenuPosition: null }); // also close the menu
    };

    private onSignOutClick = async (ev: ButtonEvent) => {
        ev.preventDefault();
        ev.stopPropagation();

        const cli = MatrixClientPeg.get();
        if (!cli || !cli.isCryptoEnabled() || !(await cli.exportRoomKeys())?.length) {
            // log out without user prompt if they have no local megolm sessions
            defaultDispatcher.dispatch({ action: 'logout' });
        } else {
            Modal.createTrackedDialog('Logout from LeftPanel', '', LogoutDialog);
        }

        this.setState({ contextMenuPosition: null }); // also close the menu
    };

    private onSignInClick = () => {
        defaultDispatcher.dispatch({ action: 'start_login' });
        this.setState({ contextMenuPosition: null }); // also close the menu
    };

    private onRegisterClick = () => {
        defaultDispatcher.dispatch({ action: 'start_registration' });
        this.setState({ contextMenuPosition: null }); // also close the menu
    };

    private onHomeClick = (ev: ButtonEvent) => {
        ev.preventDefault();
        ev.stopPropagation();

        defaultDispatcher.dispatch<ViewHomePagePayload>({ action: Action.ViewHomePage });
        this.setState({ contextMenuPosition: null }); // also close the menu
    };

    private renderContextMenu = (): React.ReactNode => {
        if (!this.state.contextMenuPosition) return null;

        let topSection;
        const hostSignupConfig = SdkConfig.getObject("host_signup");
        if (MatrixClientPeg.get().isGuest()) {
            topSection = (
                <div className="mx_UserMenu_contextMenu_header mx_UserMenu_contextMenu_guestPrompts">
                    { _t("Got an account? <a>Sign in</a>", {}, {
                        a: sub => (
                            <AccessibleButton kind="link" onClick={this.onSignInClick}>
                                { sub }
                            </AccessibleButton>
                        ),
                    }) }
                    { _t("New here? <a>Create an account</a>", {}, {
                        a: sub => (
                            <AccessibleButton kind="link" onClick={this.onRegisterClick}>
                                { sub }
                            </AccessibleButton>
                        ),
                    }) }
                </div>
            );
        } else if (hostSignupConfig?.get("url")) {
            // If hostSignup.domains is set to a non-empty array, only show
            // dialog if the user is on the domain or a subdomain.
            const hostSignupDomains = hostSignupConfig.get("domains") || [];
            const mxDomain = MatrixClientPeg.get().getDomain();
            const validDomains = hostSignupDomains.filter(d => (d === mxDomain || mxDomain.endsWith(`.${d}`)));
            if (!hostSignupConfig.get("domains") || validDomains.length > 0) {
                topSection = <HostSignupAction onClick={this.onCloseMenu} />;
            }
        }

        let homeButton = null;
        if (this.hasHomePage) {
            homeButton = (
                <IconizedContextMenuOption
                    iconClassName="mx_UserMenu_iconHome"
                    label={_t("Home")}
                    onClick={this.onHomeClick}
                />
            );
        }

        let feedbackButton;
        if (SettingsStore.getValue(UIFeature.Feedback)) {
            feedbackButton = <IconizedContextMenuOption
                iconClassName="mx_UserMenu_iconMessage"
                label={_t("Feedback")}
                onClick={this.onProvideFeedback}
            />;
        }

        let primaryOptionList = (
            <IconizedContextMenuOptionList>
                { homeButton }
                <IconizedContextMenuOption
                    iconClassName="mx_UserMenu_iconBell"
                    label={_t("Notifications")}
                    onClick={(e) => this.onSettingsOpen(e, UserTab.Notifications)}
                />
                <IconizedContextMenuOption
                    iconClassName="mx_UserMenu_iconLock"
                    label={_t("Security & Privacy")}
                    onClick={(e) => this.onSettingsOpen(e, UserTab.Security)}
                />
                <IconizedContextMenuOption
                    iconClassName="mx_UserMenu_iconSettings"
                    label={_t("All settings")}
                    onClick={(e) => this.onSettingsOpen(e, null)}
                />
                { feedbackButton }
                <IconizedContextMenuOption
                    className="mx_IconizedContextMenu_option_red"
                    iconClassName="mx_UserMenu_iconSignOut"
                    label={_t("Sign out")}
                    onClick={this.onSignOutClick}
                />
            </IconizedContextMenuOptionList>
        );

        if (MatrixClientPeg.get().isGuest()) {
            primaryOptionList = (
                <IconizedContextMenuOptionList>
                    { homeButton }
                    <IconizedContextMenuOption
                        iconClassName="mx_UserMenu_iconSettings"
                        label={_t("Settings")}
                        onClick={(e) => this.onSettingsOpen(e, null)}
                    />
                    { feedbackButton }
                </IconizedContextMenuOptionList>
            );
        }

        const position = this.props.isPanelCollapsed
            ? toRightOf(this.state.contextMenuPosition)
            : below(this.state.contextMenuPosition);

        return <IconizedContextMenu
            {...position}
            onFinished={this.onCloseMenu}
            className="mx_UserMenu_contextMenu"
        >
            <div className="mx_UserMenu_contextMenu_header">
                <div className="mx_UserMenu_contextMenu_name">
                    <span className="mx_UserMenu_contextMenu_displayName">
                        { OwnProfileStore.instance.displayName }
                    </span>
                    <span className="mx_UserMenu_contextMenu_userId">
                        { UserIdentifierCustomisations.getDisplayUserIdentifier(
                            MatrixClientPeg.get().getUserId(), { withDisplayName: true }) }
                    </span>
                </div>

                { this.state.themeInUse !== Theme.System ?
                    <RovingAccessibleTooltipButton
                        className="mx_UserMenu_contextMenu_themeButton"
                        onClick={this.onSwitchThemeClick}
                        title={this.state.themeInUse === Theme.Dark ?
                            _t("Switch to light mode") : _t("Switch to dark mode")}
                    >
                        <img
                            src={require("../../../res/img/element-icons/roomlist/dark-light-mode.svg").default}
                            alt={_t("Switch theme")}
                            width={16}
                        />
                    </RovingAccessibleTooltipButton> : null
                }
            </div>
            { topSection }
            { primaryOptionList }
        </IconizedContextMenu>;
    };

    public render() {
        const avatarSize = 32; // should match border-radius of the avatar

        const userId = MatrixClientPeg.get().getUserId();
        const displayName = OwnProfileStore.instance.displayName || userId;
        const avatarUrl = OwnProfileStore.instance.getHttpAvatarUrl(avatarSize);

        let name: JSX.Element;
        if (!this.props.isPanelCollapsed) {
            name = <div className="mx_UserMenu_name">
                { displayName }
            </div>;
        }

        return <div className="mx_UserMenu">
            <ContextMenuButton
                onClick={this.onOpenMenuClick}
                inputRef={this.buttonRef}
                label={_t("User menu")}
                isExpanded={!!this.state.contextMenuPosition}
                onContextMenu={this.onContextMenu}
            >
                <div className="mx_UserMenu_userAvatar">
                    <BaseAvatar
                        idName={userId}
                        name={displayName}
                        url={avatarUrl}
                        width={avatarSize}
                        height={avatarSize}
                        resizeMethod="crop"
                        className="mx_UserMenu_userAvatar_BaseAvatar"
                    />
                </div>
                { name }

                { this.renderContextMenu() }
            </ContextMenuButton>

            { this.props.children }
        </div>;
    }
}
