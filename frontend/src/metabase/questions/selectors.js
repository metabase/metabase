
import { createSelector } from 'reselect';
import moment from "moment";
import { getIn } from "icepick";
import _ from "underscore";

import visualizations from "metabase/visualizations";
import {caseInsensitiveSearch} from "metabase/lib/string"

export const getEntityType          = (state, props) => props && props.entityType ? props.entityType : state.questions.lastEntityType;
export const getEntityQuery         = (state, props) => props && props.entityQuery ? JSON.stringify(props.entityQuery) : state.questions.lastEntityQuery;

export const getSection             = (state, props) => props.entityQuery && JSON.stringify(props.entityQuery);
export const getEntities            = (state, props) => state.questions.entities
export const getItemsBySection      = (state, props) => state.questions.itemsBySection

export const getSearchText          = (state, props) => state.questions.searchText;
export const getSelectedIds         = (state, props) => state.questions.selectedIds;

export const getAllCollections      = (state, props) => state.collections.collections;

export const getWritableCollections = createSelector(
    [getAllCollections],
    (collections) => _.filter(collections, collection => collection.can_write)
);

export const getQuery = createSelector(
    [getEntityQuery],
    (entityQuery) => entityQuery && JSON.parse(entityQuery)
);

const getSectionData = createSelector(
    [getItemsBySection, getEntityType, getEntityQuery],
    (itemsBySection, entityType, entityQuery) =>
        getIn(itemsBySection, [entityType, entityQuery])
);

export const getSectionLoading = createSelector(
    [getSectionData],
    (sectionData) =>
        !(sectionData && sectionData.items)
);

export const getSectionError = createSelector(
    [getSectionData],
    (sectionData) =>
        (sectionData && sectionData.error)
);

export const getEntityIds = createSelector(
    [getSectionData],
    (sectionData) =>
        sectionData ? _.sortBy(sectionData.items, id => sectionData.sortIndex[id] != null ? sectionData.sortIndex[id] : Infinity) : []
);

const getEntity = (state, props) =>
    getEntities(state, props)[props.entityType][props.entityId];

const getEntitySelected = (state, props) =>
    getSelectedIds(state, props)[props.entityId] || false;

const getEntityVisible = (state, props) =>
    caseInsensitiveSearch(getEntity(state, props).name, getSearchText(state, props));

const getLabelEntities = (state, props) => state.labels.entities.labels

export const makeGetItem = () => {
    const getItem = createSelector(
        [getEntity, getEntitySelected, getEntityVisible, getLabelEntities],
        (entity, selected, visible, labelEntities) => ({
            name: entity.name,
            id: entity.id,
            created: entity.created_at ? moment(entity.created_at).fromNow() : null,
            by: entity.creator && entity.creator.common_name,
            icon: visualizations.get(entity.display).iconName,
            favorite: entity.favorite,
            archived: entity.archived,
            collection: entity.collection,
            labels: entity.labels ? entity.labels.map(labelId => labelEntities[labelId]).filter(l => l) : [],
            selected,
            visible,
            description: entity.description
        })
    );
    return getItem;
}

export const getAllEntities = createSelector(
    [getEntityIds, getEntityType, getEntities],
    (entityIds, entityType, entities) =>
        entityIds.map(entityId => getIn(entities, [entityType, entityId]))
);

export const getVisibleEntities = createSelector(
    [getAllEntities, getSearchText],
    (allEntities, searchText) =>
        allEntities.filter(entity => caseInsensitiveSearch(entity.name, searchText))
);

export const getSelectedEntities = createSelector(
    [getVisibleEntities, getSelectedIds],
    (visibleEntities, selectedIds) =>
        visibleEntities.filter(entity => selectedIds[entity.id])
);

export const getTotalCount = createSelector(
    [getAllEntities],
    (entities) => entities.length
);

export const getVisibleCount = createSelector(
    [getVisibleEntities],
    (visibleEntities) => visibleEntities.length
);

export const getSelectedCount = createSelector(
    [getSelectedEntities],
    (selectedEntities) => selectedEntities.length
);

export const getAllAreSelected = createSelector(
    [getSelectedCount, getVisibleCount],
    (selectedCount, visibleCount) =>
        selectedCount === visibleCount && visibleCount > 0
);

export const getSectionIsArchive = createSelector(
    [getQuery],
    (query) =>
        query && query.f === "archived"
);

const sections = [
    { id: "all",       name: "All questions",   icon: "all" },
    { id: "fav",       name: "Favorites",       icon: "star" },
    { id: "recent",    name: "Recently viewed", icon: "recents" },
    { id: "mine",      name: "Saved by me",     icon: "mine" },
    { id: "popular",   name: "Most popular",    icon: "popular" }
];

export const getSections    = (state, props) => sections;

export const getEditingLabelId = (state, props) => state.labels.editing;

export const getLabels = createSelector(
    [(state, props) => state.labels.entities.labels, (state, props) => state.labels.labelIds],
    (labelEntities, labelIds) =>
        labelIds ? labelIds.map(id => labelEntities[id]).sort((a, b) => a.name.localeCompare(b.name)) : []
);

export const getLabelsLoading = (state, props) => !state.labels.labelIds;
export const getLabelsError = (state, props) => state.labels.error;

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
);

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

export const getSectionName = createSelector(
    [getSection, getSections, getLabels],
    (sectionId, sections, labels) => {
        let match = sectionId && sectionId.match(/^(.*)-(.*)/);
        if (match) {
            if (match[1] === "label") {
                let label = _.findWhere(labels, { slug: match[2] });
                if (label && label.name) {
                    return label.name;
                }
            }
        } else {
            let section = _.findWhere(sections, { id: sectionId });
            if (section) {
                return section.name || "";
            } else if (sectionId === "archived") {
                return "Archive";
            }
        }
        return "";
    }
);
