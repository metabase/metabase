
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
export const getSelectedIds       = (state) => state.questions.selectedIds;
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

let fakeLabels = [];
const getEntityLabels = (state, props) => {
    return fakeLabels;
}

export const makeGetItem = () => {
    const getItem = createSelector(
        [getEntity, getEntityLabels, getEntitySelected, getEntityVisible],
        (entity, labels, selected, visible) => ({
            name: entity.name,
            id: entity.id,
            created: moment(entity.created_at).fromNow(),
            by: entity.creator.common_name,
            icon: (visualizations.get(entity.display)||{}).iconName,
            labels,
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

const getSelectedEntities = createSelector(
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

// TODO:
export const getSectionName = (state) =>
    fakeState.sections[0].name;


const fakeState = {
    sections: [
        { id: "all",       name: "All questions",   icon: "star", selected: true },
        { id: "favorites", name: "Favorites",       icon: "star" },
        { id: "recent",    name: "Recently viewed", icon: "star" },
        { id: "saved",     name: "Saved by me",     icon: "star" },
        { id: "popular",   name: "Most popular",    icon: "star" }
    ],
    topics: [
        { id: 0, name: "Revenue",    icon: "star", slug: "revenue" },
        { id: 1, name: "Users",      icon: "star", slug: "users" },
        { id: 2, name: "Orders",     icon: "star", slug: "orders" },
        { id: 3, name: "Shipments",  icon: "star", slug: "shipments" }
    ],
    labels: [
        { id: 1,  name: "CATPIs",    icon: ":cat:",   slug: "catpis"},
        { id: 2,  name: "Marketing", icon: "#885AB1", slug: "marketing" },
        { id: 3,  name: "Growth",    icon: "#F9CF48", slug: "growth" },
        { id: 4,  name: "KPIs",      icon: "#9CC177", slug: "kpis" },
        { id: 5,  name: "Q1",        icon: "#ED6E6E", slug: "q1" },
        { id: 6,  name: "q2",        icon: "#ED6E6E", slug: "q2" },
        { id: 7,  name: "All-hands", icon: "#B8A2CC", slug: "all-hands" },
        { id: 9,  name: "OLD",       icon: "#2D86D4", slug: "old" },
        { id: 10, name: "v2 schema", icon: "#2D86D4", slug: "v2-schema" },
        { id: 11, name: "Rebekah",   icon: "#2D86D4", slug: "rebekah" }
    ]
}

export const getSections    = (state) => fakeState.sections;
export const getTopics      = (state) => fakeState.topics;
export const getLabels      = (state) => fakeState.labels;
