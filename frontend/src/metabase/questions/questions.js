import {
  createAction,
  createThunkAction,
  mergeEntities,
  momentifyArraysTimestamps,
} from "metabase/lib/redux";

import { normalize, schema } from "normalizr";
import { getIn, assocIn, updateIn, chain } from "icepick";
import _ from "underscore";

import { inflect } from "metabase/lib/formatting";
import MetabaseAnalytics from "metabase/lib/analytics";
import * as Urls from "metabase/lib/urls";

import { push, replace } from "react-router-redux";
import { setRequestState } from "metabase/redux/requests";
import { addUndo } from "metabase/redux/undo";

import { getVisibleEntities, getSelectedEntities } from "./selectors";

import { SET_COLLECTION_ARCHIVED } from "./collections";

const label = new schema.Entity("labels");
const collection = new schema.Entity("collections");
const card = new schema.Entity("cards", {
  labels: [label],
  // collection: collection
});

import { CardApi, CollectionsApi } from "metabase/services";

export const LOAD_ENTITIES = "metabase/questions/LOAD_ENTITIES";
const SET_SEARCH_TEXT = "metabase/questions/SET_SEARCH_TEXT";
const SET_ITEM_SELECTED = "metabase/questions/SET_ITEM_SELECTED";
const SET_ALL_SELECTED = "metabase/questions/SET_ALL_SELECTED";
const SET_FAVORITED = "metabase/questions/SET_FAVORITED";
const SET_ARCHIVED = "metabase/questions/SET_ARCHIVED";
const SET_LABELED = "metabase/questions/SET_LABELED";
const SET_COLLECTION = "metabase/collections/SET_COLLECTION";

export const loadEntities = createThunkAction(
  LOAD_ENTITIES,
  (entityType, entityQueryObject) => {
    return async (dispatch, getState) => {
      let entityQuery = JSON.stringify(entityQueryObject);
      try {
        let result;
        dispatch(
          setRequestState({
            statePath: ["questions", "fetch"],
            state: "LOADING",
          }),
        );
        if (entityType === "cards") {
          result = {
            entityType,
            entityQuery,
            ...normalize(
              momentifyArraysTimestamps(await CardApi.list(entityQueryObject)),
              [card],
            ),
          };
        } else if (entityType === "collections") {
          result = {
            entityType,
            entityQuery,
            ...normalize(
              momentifyArraysTimestamps(
                await CollectionsApi.list(entityQueryObject),
              ),
              [collection],
            ),
          };
        } else {
          throw "Unknown entity type " + entityType;
        }
        dispatch(
          setRequestState({
            statePath: ["questions", "fetch"],
            state: "LOADED",
          }),
        );
        return result;
      } catch (error) {
        throw { entityType, entityQuery, error };
      }
    };
  },
);

export const search = (q, repl) =>
  (repl ? replace : push)("/questions/search?q=" + encodeURIComponent(q));

export const setFavorited = createThunkAction(
  SET_FAVORITED,
  (cardId, favorited) => {
    return async (dispatch, getState) => {
      if (favorited) {
        await CardApi.favorite({ cardId });
      } else {
        await CardApi.unfavorite({ cardId });
      }
      MetabaseAnalytics.trackEvent(
        "Questions",
        favorited ? "Favorite" : "Unfavorite",
      );
      return { id: cardId, favorite: favorited };
    };
  },
);

import React from "react";
import { Link } from "react-router";
import { t } from "c-3po";
function createUndo(type, actions, collection) {
  return {
    type: type,
    count: actions.length,
    // eslint-disable-next-line react/display-name
    message: undo => (
      <div className="flex flex-column">
        <div>
          {inflect(
            null,
            undo.count,
            t`${undo.count} question was ${type}`,
            t`${undo.count} questions were ${type}`,
          )}
          {undo.count === 1 &&
            collection && (
              <span>
                {" "}
                {t`to the`}{" "}
                <Link className="link" to={Urls.collection(collection)}>
                  {collection.name}
                </Link>{" "}
                {t`collection`}.
              </span>
            )}
        </div>
      </div>
    ),
    actions: actions,
  };
}

export const setArchived = createThunkAction(
  SET_ARCHIVED,
  (cardId, archived, undoable = false) => {
    return async (dispatch, getState) => {
      if (cardId == null) {
        // bulk archive
        let selected = getSelectedEntities(getState()).filter(
          item => item.archived !== archived,
        );
        selected.map(item => dispatch(setArchived(item.id, archived)));
        // TODO: errors
        if (undoable) {
          dispatch(
            addUndo(
              createUndo(
                archived ? "archived" : "unarchived",
                selected.map(item => setArchived(item.id, !archived)),
              ),
            ),
          );
          MetabaseAnalytics.trackEvent(
            "Questions",
            archived ? "Bulk Archive" : "Bulk Unarchive",
            selected.length,
          );
        }
      } else {
        let card = {
          ...getState().questions.entities.cards[cardId],
          archived: archived,
        };
        let response = await CardApi.update(card);
        if (undoable) {
          dispatch(
            addUndo(
              createUndo(
                archived ? "archived" : "unarchived",
                [setArchived(cardId, !archived)],
                !archived && card.collection,
              ),
            ),
          );
          MetabaseAnalytics.trackEvent(
            "Questions",
            archived ? "Archive" : "Unarchive",
          );
        }
        return response;
      }
    };
  },
);

export const setLabeled = createThunkAction(
  SET_LABELED,
  (cardId, labelId, labeled, undoable = false) => {
    return async (dispatch, getState) => {
      if (cardId == null) {
        // bulk label
        let selected = getSelectedEntities(getState());
        selected.map(item => dispatch(setLabeled(item.id, labelId, labeled)));
        // TODO: errors
        if (undoable) {
          dispatch(
            addUndo(
              createUndo(
                labeled ? "labeled" : "unlabeled",
                selected.map(item => setLabeled(item.id, labelId, !labeled)),
              ),
            ),
          );
          MetabaseAnalytics.trackEvent(
            "Questions",
            labeled ? "Bulk Apply Label" : "Bulk Remove Label",
            selected.length,
          );
        }
      } else {
        const state = getState();
        const labelSlug = getIn(state.questions, [
          "entities",
          "labels",
          labelId,
          "slug",
        ]);
        const labels = getIn(state.questions, [
          "entities",
          "cards",
          cardId,
          "labels",
        ]);
        const newLabels = labels.filter(id => id !== labelId);
        if (labeled) {
          newLabels.push(labelId);
        }
        if (labels.length !== newLabels.length) {
          await CardApi.updateLabels({ cardId, label_ids: newLabels });
          if (undoable) {
            dispatch(
              addUndo(
                createUndo(labeled ? "labeled" : "unlabeled", [
                  setLabeled(cardId, labelId, !labeled),
                ]),
              ),
            );
            MetabaseAnalytics.trackEvent(
              "Questions",
              labeled ? "Apply Label" : "Remove Label",
            );
          }
          return {
            id: cardId,
            labels: newLabels,
            _changedLabelSlug: labelSlug,
            _changedLabeled: labeled,
          };
        }
      }
    };
  },
);

const getCardCollectionId = (state, cardId) =>
  getIn(state, ["questions", "entities", "cards", cardId, "collection_id"]);

export const setCollection = createThunkAction(
  SET_COLLECTION,
  (cardId, collection, undoable = false) => {
    return async (dispatch, getState) => {
      const state = getState();
      const collectionId = collection.id;
      if (cardId == null) {
        // bulk move
        let selected = getSelectedEntities(getState());
        if (undoable) {
          dispatch(
            addUndo(
              createUndo(
                "moved",
                selected.map(item =>
                  setCollection(item.id, getCardCollectionId(state, item.id)),
                ),
              ),
            ),
          );
          MetabaseAnalytics.trackEvent("Questions", "Bulk Move to Collection");
        }
        selected.map(item =>
          dispatch(setCollection(item.id, { id: collectionId })),
        );
      } else {
        const collection = _.findWhere(state.collections.collections, {
          id: collectionId,
        });

        if (undoable) {
          dispatch(
            addUndo(
              createUndo("moved", [
                setCollection(cardId, getCardCollectionId(state, cardId)),
              ]),
            ),
          );
          MetabaseAnalytics.trackEvent("Questions", "Move to Collection");
        }
        const card = await CardApi.update({
          id: cardId,
          collection_id: collectionId,
        });
        return {
          ...card,
          _changedSectionSlug: collection && collection.slug,
        };
      }
    };
  },
);

export const setSearchText = createAction(SET_SEARCH_TEXT);
export const setItemSelected = createAction(SET_ITEM_SELECTED);

export const setAllSelected = createThunkAction(SET_ALL_SELECTED, selected => {
  return async (dispatch, getState) => {
    const visibleEntities = getVisibleEntities(getState());
    let selectedIds = {};
    if (selected) {
      for (let entity of visibleEntities) {
        selectedIds[entity.id] = true;
      }
    }
    MetabaseAnalytics.trackEvent(
      "Questions",
      selected ? "Select All" : "Unselect All",
      visibleEntities.length,
    );
    return selectedIds;
  };
});

const initialState = {
  lastEntityType: null,
  lastEntityQuery: null,
  entities: {},
  loadingInitialEntities: true,
  itemsBySection: {},
  searchText: "",
  selectedIds: {},
  undos: [],
};

export default function(state = initialState, { type, payload, error }) {
  switch (type) {
    case SET_SEARCH_TEXT:
      return { ...state, searchText: payload };
    case SET_ITEM_SELECTED:
      return { ...state, selectedIds: { ...state.selectedIds, ...payload } };
    case SET_ALL_SELECTED:
      return { ...state, selectedIds: payload };
    case LOAD_ENTITIES:
      if (error) {
        return assocIn(
          state,
          ["itemsBySection", payload.entityType, payload.entityQuery, "error"],
          payload.error,
        );
      } else {
        return (
          chain(state)
            .assoc("loadingInitialEntities", false)
            .assoc("entities", mergeEntities(state.entities, payload.entities))
            .assoc("lastEntityType", payload.entityType)
            .assoc("lastEntityQuery", payload.entityQuery)
            .assoc("selectedIds", {})
            .assoc("searchText", "")
            .assocIn(
              [
                "itemsBySection",
                payload.entityType,
                payload.entityQuery,
                "error",
              ],
              null,
            )
            .assocIn(
              [
                "itemsBySection",
                payload.entityType,
                payload.entityQuery,
                "items",
              ],
              payload.result,
            )
            // store the initial sort order so if we remove and undo an item it can be put back in it's original location
            .assocIn(
              [
                "itemsBySection",
                payload.entityType,
                payload.entityQuery,
                "sortIndex",
              ],
              payload.result.reduce((o, id, i) => {
                o[id] = i;
                return o;
              }, {}),
            )
            .value()
        );
      }
    case SET_FAVORITED:
      if (error) {
        return state;
      } else if (payload && payload.id != null) {
        state = assocIn(state, ["entities", "cards", payload.id], {
          ...getIn(state, ["entities", "cards", payload.id]),
          ...payload,
        });
        // FIXME: incorrectly adds to sections it may not have previously been in, but not a big deal since we reload whens switching sections
        state = updateSections(
          state,
          "cards",
          payload.id,
          s => s.f === "fav",
          payload.favorite,
        );
      }
      return state;
    case SET_ARCHIVED:
      if (error) {
        return state;
      } else if (payload && payload.id != null) {
        state = assocIn(state, ["entities", "cards", payload.id], {
          ...getIn(state, ["entities", "cards", payload.id]),
          ...payload,
        });
        // FIXME: incorrectly adds to sections it may not have previously been in, but not a big deal since we reload whens switching sections
        state = updateSections(
          state,
          "cards",
          payload.id,
          s => s.f === "archived",
          payload.archived,
        );
        state = updateSections(
          state,
          "cards",
          payload.id,
          s => s.f !== "archived",
          !payload.archived,
        );
      }
      return state;
    case SET_LABELED:
      if (error) {
        return state;
      } else if (payload && payload.id != null) {
        state = assocIn(state, ["entities", "cards", payload.id], {
          ...getIn(state, ["entities", "cards", payload.id]),
          ...payload,
        });
        // FIXME: incorrectly adds to sections it may not have previously been in, but not a big deal since we reload whens switching sections
        state = updateSections(
          state,
          "cards",
          payload.id,
          s => s.label === payload._changedLabelSlug,
          payload._changedLabeled,
        );
      }
      return state;
    case SET_COLLECTION:
      if (error) {
        return state;
      } else if (payload && payload.id != null) {
        state = assocIn(state, ["entities", "cards", payload.id], {
          ...getIn(state, ["entities", "cards", payload.id]),
          ...payload,
        });
        state = updateSections(
          state,
          "cards",
          payload.id,
          s => s.collection !== payload._changedSectionSlug,
          false,
        );
        state = updateSections(
          state,
          "cards",
          payload.id,
          s => s.collection === payload._changedSectionSlug,
          true,
        );
      }
      return state;
    case SET_COLLECTION_ARCHIVED:
      if (error) {
        return state;
      } else if (payload && payload.id != null) {
        state = assocIn(state, ["entities", "collections", payload.id], {
          ...getIn(state, ["entities", "collections", payload.id]),
          ...payload,
        });
        state = updateSections(
          state,
          "collections",
          payload.id,
          s => s.archived,
          payload.archived,
        );
        state = updateSections(
          state,
          "collections",
          payload.id,
          s => !s.archived,
          !payload.archived,
        );
      }
      return state;
    default:
      return state;
  }
}

function updateSections(
  state,
  entityType,
  entityId,
  sectionPredicate,
  shouldContain,
) {
  return updateIn(state, ["itemsBySection", entityType], entityQueries =>
    _.mapObject(entityQueries, (entityQueryResult, entityQuery) => {
      if (sectionPredicate(JSON.parse(entityQuery))) {
        const doesContain = _.contains(entityQueryResult.items, entityId);
        if (!doesContain && shouldContain) {
          return {
            ...entityQueryResult,
            items: entityQueryResult.items.concat(entityId),
          };
        } else if (doesContain && !shouldContain) {
          return {
            ...entityQueryResult,
            items: entityQueryResult.items.filter(id => id !== entityId),
          };
        }
      }
      return entityQueryResult;
    }),
  );
}
