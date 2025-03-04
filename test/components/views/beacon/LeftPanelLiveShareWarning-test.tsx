/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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
import { mocked } from 'jest-mock';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import { Beacon, BeaconIdentifier } from 'matrix-js-sdk/src/matrix';

import LeftPanelLiveShareWarning from '../../../../src/components/views/beacon/LeftPanelLiveShareWarning';
import { OwnBeaconStore, OwnBeaconStoreEvent } from '../../../../src/stores/OwnBeaconStore';
import { flushPromises, makeBeaconInfoEvent } from '../../../test-utils';
import dispatcher from '../../../../src/dispatcher/dispatcher';
import { Action } from '../../../../src/dispatcher/actions';

jest.mock('../../../../src/stores/OwnBeaconStore', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const EventEmitter = require("events");
    class MockOwnBeaconStore extends EventEmitter {
        public getLiveBeaconIdsWithLocationPublishError = jest.fn().mockReturnValue([]);
        public getBeaconById = jest.fn();
        public getLiveBeaconIds = jest.fn().mockReturnValue([]);
        public readonly beaconUpdateErrors = new Map<BeaconIdentifier, Error>();
        public readonly beacons = new Map<BeaconIdentifier, Beacon>();
    }
    return {
        // @ts-ignore
        ...jest.requireActual('../../../../src/stores/OwnBeaconStore'),
        OwnBeaconStore: {
            instance: new MockOwnBeaconStore() as unknown as OwnBeaconStore,
        },
    };
},
);

describe('<LeftPanelLiveShareWarning />', () => {
    const defaultProps = {};
    const getComponent = (props = {}) =>
        mount(<LeftPanelLiveShareWarning {...defaultProps} {...props} />);

    const roomId1 = '!room1:server';
    const roomId2 = '!room2:server';
    const aliceId = '@alive:server';

    const now = 1647270879403;
    const HOUR_MS = 3600000;

    beforeEach(() => {
        jest.spyOn(global.Date, 'now').mockReturnValue(now);
        jest.spyOn(dispatcher, 'dispatch').mockClear().mockImplementation(() => { });

        OwnBeaconStore.instance.beaconUpdateErrors.clear();
    });

    afterAll(() => {
        jest.spyOn(global.Date, 'now').mockRestore();

        jest.restoreAllMocks();
    });
    // 12h old, 12h left
    const beacon1 = new Beacon(makeBeaconInfoEvent(aliceId,
        roomId1,
        { timeout: HOUR_MS * 24, timestamp: now - 12 * HOUR_MS },
        '$1',
    ));
    // 10h left
    const beacon2 = new Beacon(makeBeaconInfoEvent(aliceId,
        roomId2,
        { timeout: HOUR_MS * 10, timestamp: now },
        '$2',
    ));

    it('renders nothing when user has no live beacons', () => {
        const component = getComponent();
        expect(component.html()).toBe(null);
    });

    describe('when user has live location monitor', () => {
        beforeAll(() => {
            mocked(OwnBeaconStore.instance).getBeaconById.mockImplementation(beaconId => {
                if (beaconId === beacon1.identifier) {
                    return beacon1;
                }
                return beacon2;
            });
        });

        beforeEach(() => {
            mocked(OwnBeaconStore.instance).isMonitoringLiveLocation = true;
            mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue([]);
            mocked(OwnBeaconStore.instance).getLiveBeaconIds.mockReturnValue([beacon2.identifier, beacon1.identifier]);
        });

        afterAll(() => {
            jest.spyOn(document, 'addEventListener').mockRestore();
        });

        it('renders correctly when not minimized', () => {
            const component = getComponent();
            expect(component).toMatchSnapshot();
        });

        it('goes to room of latest beacon when clicked', () => {
            const component = getComponent();
            const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

            act(() => {
                component.simulate('click');
            });

            expect(dispatchSpy).toHaveBeenCalledWith({
                action: Action.ViewRoom,
                metricsTrigger: undefined,
                // latest beacon's room
                room_id: roomId2,
            });
        });

        it('renders correctly when minimized', () => {
            const component = getComponent({ isMinimized: true });
            expect(component).toMatchSnapshot();
        });

        it('renders location publish error', () => {
            mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue(
                [beacon1.identifier],
            );
            const component = getComponent();
            expect(component).toMatchSnapshot();
        });

        it('goes to room of latest beacon with location publish error when clicked', () => {
            mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue(
                [beacon1.identifier],
            );
            const component = getComponent();
            const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

            act(() => {
                component.simulate('click');
            });

            expect(dispatchSpy).toHaveBeenCalledWith({
                action: Action.ViewRoom,
                metricsTrigger: undefined,
                // error beacon's room
                room_id: roomId1,
            });
        });

        it('goes back to default style when wire errors are cleared', () => {
            mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue(
                [beacon1.identifier],
            );
            const component = getComponent();
            // error mode
            expect(component.find('.mx_LeftPanelLiveShareWarning').at(0).text()).toEqual(
                'An error occurred whilst sharing your live location',
            );

            act(() => {
                mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue([]);
                OwnBeaconStore.instance.emit(OwnBeaconStoreEvent.LocationPublishError, 'abc');
            });

            component.setProps({});

            // default mode
            expect(component.find('.mx_LeftPanelLiveShareWarning').at(0).text()).toEqual(
                'You are sharing your live location',
            );
        });

        it('removes itself when user stops having live beacons', async () => {
            const component = getComponent({ isMinimized: true });
            // started out rendered
            expect(component.html()).toBeTruthy();

            act(() => {
                mocked(OwnBeaconStore.instance).isMonitoringLiveLocation = false;
                OwnBeaconStore.instance.emit(OwnBeaconStoreEvent.MonitoringLivePosition);
            });

            await flushPromises();
            component.setProps({});

            expect(component.html()).toBe(null);
        });

        it('refreshes beacon liveness monitors when pagevisibilty changes to visible', () => {
            OwnBeaconStore.instance.beacons.set(beacon1.identifier, beacon1);
            OwnBeaconStore.instance.beacons.set(beacon2.identifier, beacon2);
            const beacon1MonitorSpy = jest.spyOn(beacon1, 'monitorLiveness');
            const beacon2MonitorSpy = jest.spyOn(beacon1, 'monitorLiveness');

            jest.spyOn(document, 'addEventListener').mockImplementation(
                (_e, listener) => (listener as EventListener)(new Event('')),
            );

            expect(beacon1MonitorSpy).not.toHaveBeenCalled();

            getComponent();

            expect(beacon1MonitorSpy).toHaveBeenCalled();
            expect(beacon2MonitorSpy).toHaveBeenCalled();
        });

        describe('stopping errors', () => {
            it('renders stopping error', () => {
                OwnBeaconStore.instance.beaconUpdateErrors.set(beacon2.identifier, new Error('error'));
                const component = getComponent();
                expect(component.text()).toEqual('An error occurred while stopping your live location');
            });

            it('starts rendering stopping error on beaconUpdateError emit', () => {
                const component = getComponent();
                // no error
                expect(component.text()).toEqual('You are sharing your live location');

                act(() => {
                    OwnBeaconStore.instance.beaconUpdateErrors.set(beacon2.identifier, new Error('error'));
                    OwnBeaconStore.instance.emit(OwnBeaconStoreEvent.BeaconUpdateError, beacon2.identifier, true);
                });

                expect(component.text()).toEqual('An error occurred while stopping your live location');
            });

            it('renders stopping error when beacons have stopping and location errors', () => {
                mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue(
                    [beacon1.identifier],
                );
                OwnBeaconStore.instance.beaconUpdateErrors.set(beacon2.identifier, new Error('error'));
                const component = getComponent();
                expect(component.text()).toEqual('An error occurred while stopping your live location');
            });

            it('goes to room of latest beacon with stopping error when clicked', () => {
                mocked(OwnBeaconStore.instance).getLiveBeaconIdsWithLocationPublishError.mockReturnValue(
                    [beacon1.identifier],
                );
                OwnBeaconStore.instance.beaconUpdateErrors.set(beacon2.identifier, new Error('error'));
                const component = getComponent();
                const dispatchSpy = jest.spyOn(dispatcher, 'dispatch');

                act(() => {
                    component.simulate('click');
                });

                expect(dispatchSpy).toHaveBeenCalledWith({
                    action: Action.ViewRoom,
                    metricsTrigger: undefined,
                    // stopping error beacon's room
                    room_id: beacon2.roomId,
                });
            });
        });
    });
});
