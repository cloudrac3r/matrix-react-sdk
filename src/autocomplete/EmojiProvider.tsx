/*
Copyright 2016 Aviral Dasgupta
Copyright 2017 Vector Creations Ltd
Copyright 2017, 2018 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.
Copyright 2022 Ryan Browne <code@commonlawfeature.com>

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

import React from 'react';
import { uniq, sortBy, ListIteratee } from 'lodash';
import EMOTICON_REGEX from 'emojibase-regex/emoticon';
import { Room } from 'matrix-js-sdk/src/models/room';
import { MatrixEvent } from 'matrix-js-sdk/src/matrix';

import { _t } from '../languageHandler';
import AutocompleteProvider from './AutocompleteProvider';
import QueryMatcher from './QueryMatcher';
import { PillCompletion } from './Components';
import { ICompletion, ISelectionRange } from './Autocompleter';
import SettingsStore from "../settings/SettingsStore";
import { EMOJI, IEmoji } from '../emoji';
import { TimelineRenderingType } from '../contexts/RoomContext';
import { mediaFromMxc } from '../customisations/Media';
import { ICustomEmoji, loadImageSet } from '../emojipicker/customemoji';

const LIMIT = 20;

// Match for ascii-style ";-)" emoticons or ":wink:" shortcodes provided by emojibase
// anchored to only match from the start of parts otherwise it'll show emoji suggestions whilst typing matrix IDs
const EMOJI_REGEX = new RegExp('(' + EMOTICON_REGEX.source + '|(?:^|\\s):[+-\\w]*:?)$', 'g');

interface ISortedEmoji {
    emoji: IEmoji | ICustomEmoji;
    _orderBy: number;
}

const SORTED_EMOJI: ISortedEmoji[] = EMOJI.sort((a, b) => {
    if (a.group === b.group) {
        return a.order - b.order;
    }
    return a.group - b.group;
}).map((emoji, index) => ({
    emoji,
    // Include the index so that we can preserve the original order
    _orderBy: index,
}));

function score(query, space) {
    const index = space.indexOf(query);
    if (index === -1) {
        return Infinity;
    } else {
        return index;
    }
}

function colonsTrimmed(str: string): string {
    // Trim off leading and potentially trailing `:` to correctly match the emoji data as they exist in emojibase.
    // Notes: The regex is pinned to the start and end of the string so that we can use the lazy-capturing `*?` matcher.
    // It needs to be lazy so that the trailing `:` is not captured in the replacement group, if it exists.
    return str.replace(/^:(.*?):?$/, "$1");
}

export default class EmojiProvider extends AutocompleteProvider {
    matcher: QueryMatcher<ISortedEmoji>;
    nameMatcher: QueryMatcher<ISortedEmoji>;
    customEmojiMatcher: QueryMatcher<ISortedEmoji>;

    constructor(room: Room, renderingType?: TimelineRenderingType) {
        super({ commandRegex: EMOJI_REGEX, renderingType });
        this.matcher = new QueryMatcher<ISortedEmoji>(SORTED_EMOJI, {
            keys: [],
            funcs: [o => o.emoji.shortcodes.map(s => `:${s}:`)],
            // For matching against ascii equivalents
            shouldMatchWordsOnly: false,
        });
        this.nameMatcher = new QueryMatcher(SORTED_EMOJI, {
            keys: ['emoji.label'],
            // For removing punctuation
            shouldMatchWordsOnly: true,
        });

        // Load this room's image sets.
        const imageSetEvents = room.currentState.getStateEvents('im.ponies.room_emotes');
        const loadedImages: ICustomEmoji[] = imageSetEvents.flatMap(imageSetEvent => loadImageSet(imageSetEvent));
        const sortedCustomImages = loadedImages.map((emoji, index) => ({
            emoji,
            // Include the index so that we can preserve the original order
            _orderBy: index,
        }));
        this.customEmojiMatcher = new QueryMatcher<ISortedEmoji>(sortedCustomImages, {
            keys: [],
            funcs: [o => o.emoji.shortcodes.map(s => `:${s}:`)],
            shouldMatchWordsOnly: true,
        });
    }

    async getCompletions(
        query: string,
        selection: ISelectionRange,
        force?: boolean,
        limit = -1,
    ): Promise<ICompletion[]> {
        if (!SettingsStore.getValue("MessageComposerInput.suggestEmoji")) {
            return []; // don't give any suggestions if the user doesn't want them
        }

        let completionResult: ICompletion[] = [];
        const { command, range } = this.getCurrentCommand(query, selection);

        if (command && command[0].length > 2) {
            let completions: ISortedEmoji[] = [];

            // find completions
            const matchedString = command[0];
            completions = this.matcher.match(matchedString, limit);

            // Do second match with shouldMatchWordsOnly in order to match against 'name'
            completions = completions.concat(this.nameMatcher.match(matchedString, limit));

            // do a match for the custom emoji
            completions = completions.concat(this.customEmojiMatcher.match(matchedString, limit));

            const sorters: ListIteratee<ISortedEmoji>[] = [];
            // make sure that emoticons come first
            sorters.push(c => score(matchedString, c.emoji.emoticon || ""));

            // then sort by score (Infinity if matchedString not in shortcode)
            sorters.push(c => score(matchedString, c.emoji.shortcodes[0]));
            // then sort by max score of all shortcodes, trim off the `:`
            const trimmedMatch = colonsTrimmed(matchedString);
            sorters.push(c => Math.min(
                ...c.emoji.shortcodes.map(s => score(trimmedMatch, s)),
            ));
            // If the matchedString is not empty, sort by length of shortcode. Example:
            //  matchedString = ":bookmark"
            //  completions = [":bookmark:", ":bookmark_tabs:", ...]
            if (matchedString.length > 1) {
                sorters.push(c => c.emoji.shortcodes[0].length);
            }
            // Finally, sort by original ordering
            sorters.push(c => c._orderBy);
            completions = sortBy(uniq(completions), sorters);

            completionResult = completions.map(c => {
                if ('unicode' in c.emoji) {
                    return {
                        completion: c.emoji.unicode,
                        component: (
                            <PillCompletion title={`:${c.emoji.shortcodes[0]}:`} aria-label={c.emoji.unicode}>
                                <span>{ c.emoji.unicode }</span>
                            </PillCompletion>
                        ),
                        range,
                    };
                } else {
                    const mediaUrl = mediaFromMxc(c.emoji.url).getThumbnailOfSourceHttp(24, 24, 'scale');
                    return {
                        completion: c.emoji.shortcodes[0],
                        type: "customEmoji",
                        completionId: c.emoji.url,
                        component: (
                            <PillCompletion title={`:${c.emoji.shortcodes[0]}:`}>
                                <img
                                    className="mx_customEmoji_image"
                                    src={mediaUrl}
                                    alt={c.emoji.shortcodes[0]} />
                            </PillCompletion>
                        ),
                        range,
                    } as const;
                }
            }).slice(0, LIMIT);
        }
        return completionResult;
    }

    getName() {
        return '😃 ' + _t('Emoji');
    }

    renderCompletions(completions: React.ReactNode[]): React.ReactNode {
        return (
            <div
                className="mx_Autocomplete_Completion_container_pill"
                role="presentation"
                aria-label={_t("Emoji Autocomplete")}
            >
                { completions }
            </div>
        );
    }
}
