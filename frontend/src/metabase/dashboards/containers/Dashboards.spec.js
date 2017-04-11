import React from 'react';
import renderer from 'react-test-renderer';
import {Provider} from 'react-redux';

import Dashboards from './Dashboards';
import {noDashboardsStore, twoDashboardsStore} from './Dashboards.spec.data';

describe('Dashboards list view', () => {
    it('should render correctly without dashboards', () => {
        const tree = renderer.create(
            <Provider store={noDashboardsStore}>
                <Dashboards />
            </Provider>).toJSON();

        console.log(tree);
        expect(tree).toMatchSnapshot()
    })

    it('should render correctly with two dashboards', () => {
        const tree = renderer.create(
            <Provider store={twoDashboardsStore}>
                <Dashboards />
            </Provider>).toJSON();

        console.log(tree);
        expect(tree).toMatchSnapshot()
    })
})