import { assoc } from 'icepick';

import {
    handleActions,
    createAction,
    createThunkAction,
    fetchData
} from 'metabase/lib/redux';

import MetabaseAnalytics from 'metabase/lib/analytics';

import { GettingStartedApi } from "metabase/services";

const FETCH_GUIDE = "metabase/reference/FETCH_GUIDE";
export const fetchGuide = createThunkAction(FETCH_GUIDE, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["reference", 'guide'];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            return await GettingStartedApi.get();
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const SET_ERROR = "metabase/reference/SET_ERROR";
export const setError = createAction(SET_ERROR);

const CLEAR_ERROR = "metabase/reference/CLEAR_ERROR";
export const clearError = createAction(CLEAR_ERROR);

const START_LOADING = "metabase/reference/START_LOADING";
export const startLoading = createAction(START_LOADING);

const END_LOADING = "metabase/reference/END_LOADING";
export const endLoading = createAction(END_LOADING);

const START_EDITING = "metabase/reference/START_EDITING";
export const startEditing = createAction(START_EDITING, () => {
    MetabaseAnalytics.trackEvent('Data Reference', 'Started Editing');
});

const END_EDITING = "metabase/reference/END_EDITING";
export const endEditing = createAction(END_EDITING, () => {
    MetabaseAnalytics.trackEvent('Data Reference', 'Ended Editing');
});

const EXPAND_FORMULA = "metabase/reference/EXPAND_FORMULA";
export const expandFormula = createAction(EXPAND_FORMULA);

const COLLAPSE_FORMULA = "metabase/reference/COLLAPSE_FORMULA";
export const collapseFormula = createAction(COLLAPSE_FORMULA);

//TODO: consider making an app-wide modal state reducer and related actions
const SHOW_DASHBOARD_MODAL = "metabase/reference/SHOW_DASHBOARD_MODAL";
export const showDashboardModal = createAction(SHOW_DASHBOARD_MODAL);

const HIDE_DASHBOARD_MODAL = "metabase/reference/HIDE_DASHBOARD_MODAL";
export const hideDashboardModal = createAction(HIDE_DASHBOARD_MODAL);


const initialState = {
    error: null,
    isLoading: false,
    isEditing: false,
    isFormulaExpanded: false,
    isDashboardModalOpen: false
};
export default handleActions({
    [FETCH_GUIDE]: {
        next: (state, { payload }) => assoc(state, 'guide', payload)
    },
    [SET_ERROR]: {
        throw: (state, { payload }) => assoc(state, 'error', payload)
    },
    [CLEAR_ERROR]: {
        next: (state) => assoc(state, 'error', null)
    },
    [START_LOADING]: {
        next: (state) => assoc(state, 'isLoading', true)
    },
    [END_LOADING]: {
        next: (state) => assoc(state, 'isLoading', false)
    },
    [START_EDITING]: {
        next: (state) => assoc(state, 'isEditing', true)
    },
    [END_EDITING]: {
        next: (state) => assoc(state, 'isEditing', false)
    },
    [EXPAND_FORMULA]: {
        next: (state) => assoc(state, 'isFormulaExpanded', true)
    },
    [COLLAPSE_FORMULA]: {
        next: (state) => assoc(state, 'isFormulaExpanded', false)
    },
    [SHOW_DASHBOARD_MODAL]: {
        next: (state) => assoc(state, 'isDashboardModalOpen', true)
    },
    [HIDE_DASHBOARD_MODAL]: {
        next: (state) => assoc(state, 'isDashboardModalOpen', false)
    }
}, initialState);
