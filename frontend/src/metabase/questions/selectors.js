
import { createSelector } from 'reselect';
import moment from "moment";
import i from "icepick";
import _ from "underscore";

import visualizations from "metabase/visualizations";

function caseInsensitiveSearch(haystack, needle) {
    return !needle || (haystack != null && haystack.toLowerCase().indexOf(needle.toLowerCase()) >= 0);
}

export const getEntityType          = (state) => state.questions.type
export const getSection             = (state) => state.questions.section
export const getEntities            = (state) => state.questions.entities
export const getItemsBySection      = (state) => state.questions.itemsBySection

export const getSearchText          = (state) => state.questions.searchText;
export const getSelectedIds         = (state) => state.questions.selectedIds;

const getSectionData = createSelector(
    [getItemsBySection, getEntityType, getSection],
    (itemsBySection, type, section) =>
        i.getIn(itemsBySection, [type, section])
);

export const getSectionLoading = createSelector(
    [getSectionData],
    (sectionData) =>
        !(sectionData && sectionData.items)
);

export const getSectionError = (state) =>
    !!state.questions.sectionError;

export const getEntityIds = createSelector(
    [getSectionData],
    (sectionData) =>
        sectionData ? _.sortBy(sectionData.items, id => sectionData.sortIndex[id] != null ? sectionData.sortIndex[id] : Infinity) : []
);

const getEntity = (state, props) =>
    getEntities(state)[props.entityType][props.entityId];

const getEntitySelected = (state, props) =>
    getSelectedIds(state)[props.entityId] || false;

const getEntityVisible = (state, props) =>
    caseInsensitiveSearch(getEntity(state, props).name, getSearchText(state));

const getLabelEntities = (state) => state.labels.entities.labels

export const makeGetItem = () => {
    const getItem = createSelector(
        [getEntity, getEntitySelected, getEntityVisible, getLabelEntities],
        (entity, selected, visible, labelEntities) => ({
            name: entity.name,
            id: entity.id,
            created: moment(entity.created_at).fromNow(),
            by: entity.creator.common_name,
            icon: visualizations.get(entity.display).iconName,
            favorite: entity.favorite,
            archived: entity.archived,
            labels: entity.labels.map(labelId => labelEntities[labelId]).filter(l => l),
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
    [getSection],
    (section) =>
        section === "archived"
);

const sections = [
    { id: "all",       name: "All questions",   icon: "all" },
    { id: "favorites", name: "Favorites",       icon: "star" },
    { id: "recent",    name: "Recently viewed", icon: "recents" },
    { id: "saved",     name: "Saved by me",     icon: "mine" },
    { id: "popular",   name: "Most popular",    icon: "popular" }
];

export const getSections    = (state) => sections;

export const getEditingLabelId = (state) => state.labels.editing;

export const getLabels = createSelector(
    [(state) => state.labels.entities.labels, (state) => state.labels.labelIds],
    (labelEntities, labelIds) =>
        labelIds ? labelIds.map(id => labelEntities[id]).sort((a, b) => a.name.localeCompare(b.name)) : []
);

export const getLabelsLoading = (state) => !state.labels.labelIds;
export const getLabelsError = (state) => state.labels.error;

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

export const getUndos = (state) => state.undo;
