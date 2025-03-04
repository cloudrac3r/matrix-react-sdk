/*
Copyright 2019 New Vector Ltd
Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

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

import React from "react";
import classNames from "classnames";

import SettingsStore from "../../../settings/SettingsStore";
import EventTilePreview from "../elements/EventTilePreview";
import StyledRadioButton from "../elements/StyledRadioButton";
import { _t } from "../../../languageHandler";
import { Layout } from "../../../settings/enums/Layout";
import { SettingLevel } from "../../../settings/SettingLevel";
import SettingsFlag from "../elements/SettingsFlag";

interface IProps {
    userId?: string;
    displayName: string;
    avatarUrl: string;
    messagePreviewText: string;
    onLayoutChanged?: (layout: Layout) => void;
}

interface IState {
    layout: Layout;
    adaptiveSideBubbles: boolean;
}

export default class LayoutSwitcher extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            layout: SettingsStore.getValue("layout"),
            adaptiveSideBubbles: SettingsStore.getValue("adaptiveSideBubbles"),
        };
    }

    private onLayoutChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const layout = e.target.value as Layout;

        this.setState({ layout: layout });
        SettingsStore.setValue("layout", null, SettingLevel.DEVICE, layout);
        this.props.onLayoutChanged(layout);
    };

    public render(): JSX.Element {
        const ircClasses = classNames("mx_LayoutSwitcher_RadioButton", {
            mx_LayoutSwitcher_RadioButton_selected: this.state.layout == Layout.IRC,
        });
        const groupClasses = classNames("mx_LayoutSwitcher_RadioButton", {
            mx_LayoutSwitcher_RadioButton_selected: this.state.layout == Layout.Group,
        });
        const bubbleClasses = classNames("mx_LayoutSwitcher_RadioButton", {
            mx_LayoutSwitcher_RadioButton_selected: this.state.layout === Layout.Bubble,
        });

        return <>
            <div className="mx_SettingsTab_heading">{ _t("Message layout") }</div>
            <div className="mx_SettingsTab_section mx_LayoutSwitcher">
                <div className="mx_LayoutSwitcher_RadioButtons">
                    <label className={ircClasses}>
                        <EventTilePreview
                            className="mx_LayoutSwitcher_RadioButton_preview"
                            message={this.props.messagePreviewText}
                            layout={Layout.IRC}
                            userId={this.props.userId}
                            displayName={this.props.displayName}
                            avatarUrl={this.props.avatarUrl}
                        />
                        <StyledRadioButton
                            name="layout"
                            value={Layout.IRC}
                            checked={this.state.layout === Layout.IRC}
                            onChange={this.onLayoutChange}
                        >
                            { _t("IRC (Experimental)") }
                        </StyledRadioButton>
                    </label>
                    <label className={groupClasses}>
                        <EventTilePreview
                            className="mx_LayoutSwitcher_RadioButton_preview"
                            message={this.props.messagePreviewText}
                            layout={Layout.Group}
                            userId={this.props.userId}
                            displayName={this.props.displayName}
                            avatarUrl={this.props.avatarUrl}
                        />
                        <StyledRadioButton
                            name="layout"
                            value={Layout.Group}
                            checked={this.state.layout == Layout.Group}
                            onChange={this.onLayoutChange}
                        >
                            { _t("Modern") }
                        </StyledRadioButton>
                    </label>
                    <label className={bubbleClasses}>
                        <EventTilePreview
                            className="mx_LayoutSwitcher_RadioButton_preview"
                            message={this.props.messagePreviewText}
                            layout={Layout.Bubble}
                            userId={this.props.userId}
                            displayName={this.props.displayName}
                            avatarUrl={this.props.avatarUrl}
                        />
                        <StyledRadioButton
                            name="layout"
                            value={Layout.Bubble}
                            checked={this.state.layout == Layout.Bubble}
                            onChange={this.onLayoutChange}
                        >
                            { _t("Message bubbles") }
                        </StyledRadioButton>
                    </label>
                </div>

                <div className="mx_LayoutSwitcher_Checkboxes">
                    { this.state.layout === Layout.Group ?
                        <SettingsFlag
                            name="useCompactLayout"
                            level={SettingLevel.DEVICE}
                            useCheckbox={true}
                        /> : null
                    }
                    { this.state.layout === Layout.Bubble ?
                        <SettingsFlag
                            name="singleSideBubbles"
                            level={SettingLevel.DEVICE}
                            useCheckbox={true}
                            disabled={this.state.adaptiveSideBubbles}
                        /> : null
                    }
                    { this.state.layout === Layout.Bubble ?
                        <SettingsFlag
                            name="adaptiveSideBubbles"
                            level={SettingLevel.DEVICE}
                            useCheckbox={true}
                            onChange={(checked) => this.setState({ adaptiveSideBubbles: checked })}
                        /> : null
                    }
                </div>
            </div>
        </>;
    }
}
