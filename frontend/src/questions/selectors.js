
import { createSelector } from 'reselect';
import moment from "moment";

import visualizations from "metabase/visualizations";

function caseInsensitiveSearch(haystack, needle) {
    return !needle || (haystack != null && haystack.toLowerCase().indexOf(needle.toLowerCase()) >= 0);
}

export const getEntityType          = (state) => state.questions.type
export const getSection             = (state) => state.questions.section
export const getSlug                = (state) => state.questions.slug

export const getSectionId           = (state) => [getEntityType(state), getSection(state), getSlug(state)].join(",")
export const getEntities            = (state) => state.questions.entities
export const getItemsBySectionId    = (state) => state.questions.itemsBySectionId

// export const getQuestions = (state) => state.questions.questions;
export const getSearchText          = (state) => state.questions.searchText;
export const getSelectedIds         = (state) => state.questions.selectedIds;
export const getAllSelected         = (state) => state.questions.allSelected

export const getEntityIds = createSelector(
    [getSectionId, getItemsBySectionId],
    (sectionId, itemsBySectionId) =>
        itemsBySectionId[sectionId] || []
);

const getEntity = (state, props) =>
    getEntities(state)[props.entityType][props.entityId];

const getEntitySelected = (state, props) =>
    getAllSelected(state) || getSelectedIds(state)[props.entityId] || false;

const getEntityVisible = (state, props) =>
    caseInsensitiveSearch(getEntity(state, props).name, getSearchText(state));

const getLabelEntities = (state) => state.questions.entities.labels

export const makeGetItem = () => {
    const getItem = createSelector(
        [getEntity, getEntitySelected, getEntityVisible, getLabelEntities],
        (entity, selected, visible, labelEntities) => ({
            name: entity.name,
            id: entity.id,
            created: moment(entity.created_at).fromNow(),
            by: entity.creator.common_name,
            icon: (visualizations.get(entity.display)||{}).iconName,
            favorite: entity.favorite,
            archived: entity.archived,
            labels: entity.labels.map(labelId => labelEntities[labelId]),
            selected,
            visible
        })
    );
    return getItem;
}

const getAllEntities = createSelector(
    [getEntityIds, getEntityType, getEntities],
    (entityIds, entityType, entities) =>
        entityIds.map(entityId => entities[entityType][entityId])
);

const getVisibleEntities = createSelector(
    [getAllEntities, getSearchText],
    (allEntities, searchText) =>
        allEntities.filter(entity => caseInsensitiveSearch(entity.name, searchText))
);

export const getSelectedEntities = createSelector(
    [getVisibleEntities, getSelectedIds, getAllSelected],
    (visibleEntities, selectedIds, allSelected) =>
        visibleEntities.filter(entity => allSelected || selectedIds[entity.id])
);

export const getVisibleCount = createSelector(
    [getVisibleEntities],
    (visibleEntities) => visibleEntities.length
)

export const getSelectedCount = createSelector(
    [getSelectedEntities],
    (selectedEntities) => selectedEntities.length
);

export const getAllAreSelected = createSelector(
    [getSelectedCount, getVisibleCount],
    (selectedCount, visibleCount) =>
        selectedCount === visibleCount && visibleCount > 0
)

// FIXME:
export const getSectionName = (state, props) =>
    sections[0].name;

const sections = [
    { id: "all",       name: "All questions",   icon: "star" },
    { id: "favorites", name: "Favorites",       icon: "star" },
    { id: "recent",    name: "Recently viewed", icon: "star" },
    { id: "saved",     name: "Saved by me",     icon: "star" },
    { id: "popular",   name: "Most popular",    icon: "star" }
];

export const getSections    = (state) => sections;
export const getTopics      = (state) => [];

export const getLabels = createSelector(
    [(state) => state.labels.entities.labels, (state) => state.labels.labels],
    (labelEntities, labelIds) =>
        labelIds.map(id => labelEntities[id])
)

const getLabelCountsForSelectedEntities = createSelector(
    [getSelectedEntities],
    (entities) => {
        let counts = {};
        for (let entity of entities) {
            for (let labelId of entity.labels) {
                counts[labelId] = (counts[labelId] || 0) + 1;
            }
        }
        return counts;
    }
)

export const getLabelsWithSelectedState = createSelector(
    [getLabels, getSelectedCount, getLabelCountsForSelectedEntities],
    (labels, selectedCount, counts) =>
        labels.map(label => ({
            ...label,
            count: counts[label.id],
            selected:
                counts[label.id] === 0 || counts[label.id] == null ? false :
                counts[label.id] === selectedCount ? true :
                null
        }))
)

export const getEditingLabelId = (state) => state.labels.editing;
