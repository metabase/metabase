
// ${object_name} duck

import { createAction, handleActions, combineReducers } from "metabase/lib/redux";
import { assoc, dissoc } from "icepick";

import { ${ObjectName}Api } from "metabase/services";

export const LOAD_${OBJECT_NAME_PLURAL} = "metabase/${object_name}/LOAD_${OBJECT_NAME_PLURAL}";
export const load${ObjectNamePlural} = createAction(LOAD_${OBJECT_NAME_PLURAL}, () => ${ObjectName}Api.list());

export const LOAD_${OBJECT_NAME} = "metabase/${object_name}/LOAD_${OBJECT_NAME}";
export const load${ObjectName} = createAction(LOAD_${OBJECT_NAME}, (id) => ${ObjectName}Api.get({ id }));

export const CREATE_${OBJECT_NAME} = "metabase/${object_name}/CREATE_${OBJECT_NAME}";
export const create${ObjectName} = createAction(CREATE_${OBJECT_NAME}, (${object_name}) => ${ObjectName}Api.create(${object_name}));

export const UPDATE_${OBJECT_NAME} = "metabase/${object_name}/UPDATE_${OBJECT_NAME}";
export const update${ObjectName} = createAction(UPDATE_${OBJECT_NAME}, (${object_name}) => ${ObjectName}Api.update(${object_name}));

export const DELETE_${OBJECT_NAME} = "metabase/${object_name}/DELETE_${OBJECT_NAME}";
export const delete${ObjectName} = createAction(DELETE_${OBJECT_NAME}, (id) => ${ObjectName}Api.delete({ id }));

// TODO: better reducer
const ${object_name_plural} = handleActions({
    [LOAD_${OBJECT_NAME_PLURAL}]:  { next: (state, { payload }) => payload.reduce((${object_name_plural}, ${object_name}) => assoc(${object_name_plural}, ${object_name}.id, ${object_name}), {}) },
    [LOAD_${OBJECT_NAME}]:   { next: (state, { payload }) => assoc(state, payload.id, payload) },
    [CREATE_${OBJECT_NAME}]: { next: (state, { payload }) => assoc(state, payload.id, payload) },
    [UPDATE_${OBJECT_NAME}]: { next: (state, { payload }) => assoc(state, payload.id, payload) },
    [DELETE_${OBJECT_NAME}]: { next: (state, { payload }) => dissoc(state, payload) },
}, {});

// TODO: better error handling
const DEFAULT_ERROR_HANDLER = {
    next: (state, { payload }) => null,
    throws: (state, { payload }) => payload
};

const error = handleActions({
    [LOAD_${OBJECT_NAME_PLURAL}]:  DEFAULT_ERROR_HANDLER,
    [LOAD_${OBJECT_NAME}]:   DEFAULT_ERROR_HANDLER,
    [CREATE_${OBJECT_NAME}]: DEFAULT_ERROR_HANDLER,
    [UPDATE_${OBJECT_NAME}]: DEFAULT_ERROR_HANDLER,
    [DELETE_${OBJECT_NAME}]: DEFAULT_ERROR_HANDLER,
}, null);

export default combineReducers({
    ${object_name_plural},
    error
});
