import React from 'react';
import renderer from 'react-test-renderer';

import {Dashboards} from './Dashboards';
import {noDashboardsList, twoDashboardsList} from './Dashboards.spec.data';

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

// Don't render Ellipsified as Tooltip class that it is using causes trouble
// (ReactDOM.findDOMNode not supported by react-test-renderer)
jest.mock('metabase/components/Ellipsified', () => () => null )

describe('Dashboards list view', () => {
    it('should render correctly in loading state', () => {
        const {component} = setupDashboards(null);
        const tree = renderer.create(component).toJSON();
        expect(tree).toMatchSnapshot()
    })

    it('should render correctly with zero dashboards', () => {
        const {component} = setupDashboards(noDashboardsList);
        const tree = renderer.create(component).toJSON();
        expect(tree).toMatchSnapshot()
    })

    it('should render correctly with two dashboards', () => {
        const {component} = setupDashboards(twoDashboardsList);
        const tree = renderer.create(component).toJSON();
        expect(tree).toMatchSnapshot()
    })
})