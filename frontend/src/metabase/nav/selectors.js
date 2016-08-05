
import { createSelector } from 'reselect';

export const getPath = (state, props) => props.location.pathname;

export const getUser = (state) => state.currentUser;

export const getContext = createSelector(
    [getPath],
    (path) =>
        path.startsWith('/auth/') ?
            'auth'
        : path.startsWith('/setup/') ?
            'setup'
        : path.startsWith('/admin/') ?
            'admin'
        : path === '/' ?
            'home'
        :
            'main'
);

export const getDashboards = (state) => state.dashboard.dashboardListing;
