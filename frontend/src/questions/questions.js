
import { AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";

import { normalize, Schema, arrayOf } from 'normalizr';
import i from "icepick";
import _ from "underscore";

const card = new Schema('cards');
const label = new Schema('labels');
card.define({
  labels: arrayOf(label)
});

const CardApi = new AngularResourceProxy("Card", ["list", "update", "favorite", "unfavorite", "updateLabels"]);

const SELECT_SECTION = 'metabase/questions/SELECT_SECTION';
const SET_SEARCH_TEXT = 'metabase/questions/SET_SEARCH_TEXT';
const SET_ITEM_SELECTED = 'metabase/questions/SET_ITEM_SELECTED';
const SET_ALL_SELECTED = 'metabase/questions/SET_ALL_SELECTED';
const SET_FAVORITED = 'metabase/questions/SET_FAVORITED';
const SET_ARCHIVED = 'metabase/questions/SET_ARCHIVED';
const SET_LABELED = 'metabase/questions/SET_LABELED';

export const selectSection = createThunkAction(SELECT_SECTION, (section = "all", slug = null, type = "cards") => {
    return async (dispatch, getState) => {
        let response;
        switch (section) {
            case "all":
                response = await CardApi.list({ f: "all" });
                break;
            case "favorites":
                response = await CardApi.list({ f: "fav" });
                break;
            case "saved":
                response = await CardApi.list({ f: "mine" });
                break;
            case "popular":
                response = await CardApi.list({ f: "popular" });
                break;
            case "recent":
                response = await CardApi.list({ f: "recent" });
                break;
            case "archived":
                response = await CardApi.list({ f: "archived" });
                break;
            case "label":
                response = await CardApi.list({ label: slug });
                break;
            default:
                console.warn("unknown section " + section);
                response = [];
        }
        return { type, section, slug, ...normalize(response, arrayOf(card)) };
    }
});

export const setFavorited = createThunkAction(SET_FAVORITED, (cardId, favorited) => {
    return async (dispatch, getState) => {
        if (favorited) {
            await CardApi.favorite({ cardId });
        } else {
            await CardApi.unfavorite({ cardId });
        }
        return { id: cardId, favorite: favorited };
    }
});

export const setArchived = createThunkAction(SET_ARCHIVED, (cardId, archived) => {
    return async (dispatch, getState) => {
        let card = {
            ...getState().questions.entities.cards[cardId],
            archived: archived
        };
        return await CardApi.update(card);
    }
});

export const setLabeled = createThunkAction(SET_LABELED, (cardId, labelId, labeled) => {
    return async (dispatch, getState) => {
        const labels = getState().questions.entities.cards[cardId].labels;
        const newLabels = labels.filter(id => id !== labelId);
        if (labeled) {
            newLabels.push(labelId);
        }
        if (labels.length !== newLabels.length) {
            await CardApi.updateLabels({ cardId, label_ids: newLabels });
            return { id: cardId, labels: newLabels };
        }
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
        case SET_FAVORITED:
            if (error) {
                return state;
            } else {
                state = i.assocIn(state, ["entities", "cards", payload.id], {
                    ...state.entities.cards[payload.id],
                    ...payload
                });
                let items = i.getIn(state, ["itemsBySectionId", "card,favorite,"]);
                if (items) {
                    if (payload.favorite && !_.contains(items, payload.id)) {
                        state = i.setIn(state, ["itemsBySectionId", "card,favorite,"], items.concat(payload.id));
                    }
                    if (!payload.favorite && _.contains(items, payload.id)) {
                        state = i.setIn(state, ["itemsBySectionId", "card,favorite,"], items.filter(id => id !== payload.id));
                    }
                }
                return state;
            }
        case SET_ARCHIVED:
            if (error) {
                return state;
            } else {
                state = i.assocIn(state, ["entities", "cards", payload.id], {
                    ...state.entities.cards[payload.id],
                    ...payload
                });
                let items = i.getIn(state, ["itemsBySectionId", "card,archived,"]);
                if (items) {
                    if (payload.archived && !_.contains(items, payload.id)) {
                        state = i.setIn(state, ["itemsBySectionId", "card,archived,"], items.concat(payload.id));
                    }
                    if (!payload.archived && _.contains(items, payload.id)) {
                        state = i.setIn(state, ["itemsBySectionId", "card,archived,"], items.filter(id => id !== payload.id));
                    }
                }
                return state;
            }
        case SET_LABELED:
            if (error) {
                return state;
            } else {
                if (payload.id == null) {
                    return state;
                }
                state = i.assocIn(state, ["entities", "cards", payload.id], {
                    ...state.entities.cards[payload.id],
                    ...payload
                });
                return state;
            }
        default:
            return state;
    }
}
