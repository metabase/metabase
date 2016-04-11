
import { AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";

import { normalize, Schema, arrayOf } from 'normalizr';

const card = new Schema('cards');
// const user = new Schema('users');
//
// card.define({
//   creator: user
// });

const CardApi = new AngularResourceProxy("Card", ["list"]);

const SELECT_SECTION = 'metabase/questions/SELECT_SECTION';
const SET_SEARCH_TEXT = 'metabase/questions/SET_SEARCH_TEXT';
const SET_ITEM_SELECTED = 'metabase/questions/SET_ITEM_SELECTED';
const SET_ALL_SELECTED = 'metabase/questions/SET_ALL_SELECTED';

export const selectSection = createThunkAction(SELECT_SECTION, (section = "all", slug = null, type = "cards") => {
    return async (dispatch, getState) => {
        let response;
        switch (section) {
            case "all":
                response = await CardApi.list({ filterMode: "all" });
                break;
            default:
                console.warn("unknown section " + section);
        }
        return { type, section, slug, ...normalize(response, arrayOf(card)) };
    }
});

export const setSearchText = createAction(SET_SEARCH_TEXT);
export const setItemSelected = createAction(SET_ITEM_SELECTED);
export const setAllSelected = createAction(SET_ALL_SELECTED);

const initialState = {
    entities: {},
    type: "cards",
    section: null,
    slug: null,
    itemsBySectionId: {},
    searchText: "",
    selectedIds: {},
    allSelected: false
};

export default function(state = initialState, { type, payload, error }) {
    if (payload && payload.entities) {
        // FIXME: deep merge
        state = {
            ...state,
            entities: {
                ...state.entities,
                ...payload.entities
            }
        };
    }

    switch (type) {
        case SET_SEARCH_TEXT:
            return { ...state, searchText: payload };
        case SET_ITEM_SELECTED:
            return { ...state, selectedIds: { ...state.selectedIds, ...payload } };
        case SET_ALL_SELECTED:
            return { ...state, selectedIds: {}, allSelected: payload };
        case SELECT_SECTION:
            let sectionId = [payload.type, payload.section, payload.slug].join(",");
            return {
                ...state,
                type: payload.type,
                section: payload.section,
                slug: payload.slug,
                itemsBySectionId: {
                    ...state.itemsBySectionId,
                    [sectionId]: payload.result
                }
            };
        default:
            return state;
    }
}
