import i from 'icepick';

import { 
    handleActions, 
    createAction,
    createThunkAction,
    AngularResourceProxy,
    cleanResource,
    fetchData,
    updateData
} from 'metabase/lib/redux';

import MetabaseAnalytics from 'metabase/lib/analytics';

const GettingStartedApi = new AngularResourceProxy("GettingStarted", ["get"]);


const FETCH_GUIDE = "metabase/metadata/FETCH_GUIDE";
export const fetchGuide = createThunkAction(FETCH_GUIDE, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "reference", 'guide'];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const guide = await GettingStartedApi.get();
            return cleanResource(guide);
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

const initialState = {
    error: null,
    isLoading: false,
    isEditing: false,
    isFormulaExpanded: false,
};
export default handleActions({
    [FETCH_GUIDE]: {
        next: (state, { payload }) => i.assoc(state, 'guide', payload) 
    },
    [SET_ERROR]: {
        throw: (state, { payload }) => i.assoc(state, 'error', payload)
    },
    [CLEAR_ERROR]: {
        next: (state) => i.assoc(state, 'error', null)
    },
    [START_LOADING]: {
        next: (state) => i.assoc(state, 'isLoading', true)
    },
    [END_LOADING]: {
        next: (state) => i.assoc(state, 'isLoading', false)
    },
    [START_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', true)
    },
    [END_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', false)
    },
    [EXPAND_FORMULA]: {
        next: (state) => i.assoc(state, 'isFormulaExpanded', true)
    },
    [COLLAPSE_FORMULA]: {
        next: (state) => i.assoc(state, 'isFormulaExpanded', false)
    }
}, initialState);
