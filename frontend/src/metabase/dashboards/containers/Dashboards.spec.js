import React from 'react';
import renderer from 'react-test-renderer';
import {Provider} from 'react-redux';

import {Dashboards} from './Dashboards';
import {noDashboardsStore, twoDashboardsStore} from './Dashboards.spec.data';

function setupDashboards(dashboards) {
    const props = {
        dashboards: dashboards,
        createDashboard: jest.fn(),
        fetchDashboards: jest.fn()
    }

    const component = <Dashboards {...props} />

    return {
        props,
        component
    }
}
describe('Dashboards list view', () => {
    it('should render correctly in loading state', () => {
        const {component} = setupDashboards(null);
        const tree = renderer.create(component).toJSON();
        expect(tree).toMatchSnapshot()
    })

    it('should render correctly with zero dashboards', () => {
        const {component} = setupDashboards(noDashboardsStore);
        const tree = renderer.create(component).toJSON();
        expect(tree).toMatchSnapshot()
    })

    it('should render correctly with two dashboards', () => {
        const {component} = setupDashboards(twoDashboardsStore);
        const tree = renderer.create(component).toJSON();
        expect(tree).toMatchSnapshot()
    })
})