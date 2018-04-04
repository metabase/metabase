/* @flow weak */

import { createSelector } from "reselect";
import moment from "moment";
import { getIn } from "icepick";
import _ from "underscore";
import visualizations from "metabase/visualizations";
import { caseInsensitiveSearch } from "metabase/lib/string";

export const getEntityType = (state, props) =>
  props && props.entityType ? props.entityType : state.questions.lastEntityType;
export const getEntityQuery = (state, props) =>
  props && props.entityQuery
    ? JSON.stringify(props.entityQuery)
    : state.questions.lastEntityQuery;

export const getLoadingInitialEntities = (state, props) =>
  state.questions.loadingInitialEntities;
export const getEntities = (state, props) => state.questions.entities;
export const getItemsBySection = (state, props) =>
  state.questions.itemsBySection;

export const getSearchText = (state, props) => state.questions.searchText;
export const getSelectedIds = (state, props) => state.questions.selectedIds;

export const getAllCollections = (state, props) =>
  state.collections.collections;

export const getWritableCollections = createSelector(
  [getAllCollections],
  collections => _.filter(collections, collection => collection.can_write),
);

export const getQuery = createSelector(
  [getEntityQuery],
  entityQuery => entityQuery && JSON.parse(entityQuery),
);

const getSectionData = createSelector(
  [getItemsBySection, getEntityType, getEntityQuery],
  (itemsBySection, entityType, entityQuery) =>
    getIn(itemsBySection, [entityType, entityQuery]),
);

export const getSectionLoading = createSelector(
  [getSectionData],
  sectionData => !(sectionData && sectionData.items),
);

export const getSectionError = createSelector(
  [getSectionData],
  sectionData => sectionData && sectionData.error,
);

export const getEntityIds = createSelector(
  [getSectionData],
  sectionData =>
    sectionData
      ? _.sortBy(
          sectionData.items,
          id =>
            sectionData.sortIndex[id] != null
              ? sectionData.sortIndex[id]
              : Infinity,
        )
      : [],
);

const getLabelEntities = (state, props) => state.labels.entities.labels;

// returns raw entity objects for the current section
export const getAllEntities = createSelector(
  [getEntityIds, getEntityType, getEntities],
  (entityIds, entityType, entities) =>
    entityIds.map(entityId => getIn(entities, [entityType, entityId])),
);

// returns visible raw entity objects for the current section
export const getVisibleEntities = createSelector(
  [getAllEntities, getSearchText],
  (allEntities, searchText) =>
    allEntities.filter(entity =>
      caseInsensitiveSearch(entity.name, searchText),
    ),
);

// returns selected raw entity objects for the current section
export const getSelectedEntities = createSelector(
  [getVisibleEntities, getSelectedIds],
  (visibleEntities, selectedIds) =>
    visibleEntities.filter(entity => selectedIds[entity.id]),
);

function iconForEntity(entity) {
  const viz = visualizations.get(entity.display);
  return viz && viz.iconName;
}

function labelsForEntity(entity, labelEntities) {
  return entity.labels
    ? entity.labels.map(labelId => labelEntities[labelId]).filter(l => l)
    : [];
}

function itemForEntity(entity, selectedIds, labelEntities) {
  return {
    entity: entity,
    id: entity.id,
    name: entity.name,
    created: entity.created_at ? moment(entity.created_at).fromNow() : null,
    by: entity.creator && entity.creator.common_name,
    icon: iconForEntity(entity),
    favorite: entity.favorite,
    archived: entity.archived,
    collection: entity.collection,
    labels: labelsForEntity(entity, labelEntities),
    selected: selectedIds[entity.id] || false,
    visible: true,
    description: entity.description,
  };
}

// return enhanced "item" objects suitable for diplay by List/Item components
export const getAllItems = createSelector(
  [getAllEntities, getLabelEntities, getSelectedIds],
  (entities, labelEntities, selectedIds) =>
    entities.map(entity => itemForEntity(entity, selectedIds, labelEntities)),
);

// returns visible items
export const getVisibleItems = createSelector(
  [getAllItems, getSearchText],
  (allItems, searchText) =>
    allItems.filter(item => caseInsensitiveSearch(item.name, searchText)),
);

// return total item count
export const getTotalCount = createSelector(
  [getAllEntities],
  entities => entities.length,
);

// returns visible item count
export const getVisibleCount = createSelector(
  [getVisibleEntities],
  visibleEntities => visibleEntities.length,
);

// returns selected item count
export const getSelectedCount = createSelector(
  [getSelectedEntities],
  selectedEntities => selectedEntities.length,
);

// returns true if all visible items are selected
export const getAllAreSelected = createSelector(
  [getSelectedCount, getVisibleCount],
  (selectedCount, visibleCount) =>
    selectedCount === visibleCount && visibleCount > 0,
);

// returns true if the current section is the archive
export const getSectionIsArchive = createSelector(
  [getQuery],
  query => query && query.f === "archived",
);

export const getEditingLabelId = (state, props) => state.labels.editing;

export const getLabels = createSelector(
  [
    (state, props) => state.labels.entities.labels,
    (state, props) => state.labels.labelIds,
  ],
  (labelEntities, labelIds) =>
    labelIds
      ? labelIds
          .map(id => labelEntities[id])
          .sort((a, b) => a.name.localeCompare(b.name))
      : [],
);

export const getLabelsLoading = (state, props) => !state.labels.labelIds;
export const getLabelsError = (state, props) => state.labels.error;

const getLabelCountsForSelectedEntities = createSelector(
  [getSelectedEntities],
  entities => {
    let counts = {};
    for (let entity of entities) {
      for (let labelId of entity.labels) {
        counts[labelId] = (counts[labelId] || 0) + 1;
      }
    }
    return counts;
  },
);

export const getLabelsWithSelectedState = createSelector(
  [getLabels, getSelectedCount, getLabelCountsForSelectedEntities],
  (labels, selectedCount, counts) =>
    labels.map(label => ({
      ...label,
      count: counts[label.id],
      selected:
        counts[label.id] === 0 || counts[label.id] == null
          ? false
          : counts[label.id] === selectedCount ? true : null,
    })),
);
