import { createSelector } from 'reselect';
import i from "icepick";

//TODO: think about memoizing some of these for perf

const referenceSections = {
    [`/reference/guide`]: {
        id: `/reference/guide`,
        name: "Understanding our data",
        breadcrumb: "Guide",
        icon: "all"
    },
    [`/reference/metrics`]: {
        id: `/reference/metrics`,
        name: "Metrics",
        breadcrumb: "Metrics",
        icon: "star"
    },
    [`/reference/lists`]: {
        id: `/reference/lists`,
        name: "Lists",
        breadcrumb: "Lists",
        icon: "recents"
    },
    [`/reference/databases`]: {
        id: `/reference/databases`,
        name: "Databases and tables",
        breadcrumb: "Databases",
        icon: "mine"
    }
};

const getDatabaseSections = (database) => database ? {
    [`/reference/databases/${database.id}`]: {
        id: `/reference/databases/${database.id}`,
        name: "Details",
        breadcrumb: `${database.name}`,
        icon: "all",
        parent: referenceSections[`/reference/databases`]
    },
    [`/reference/databases/${database.id}/tables`]: {
        id: `/reference/databases/${database.id}/tables`,
        name: `Tables in ${database.name}`,
        breadcrumb: `${database.name}`,
        icon: "star",
        parent: referenceSections[`/reference/databases`]
    }
} : {};

const getTableSections = (database, table) => database && table ? {
    [`/reference/databases/${database.id}/tables/${table.id}`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}`,
        name: "Details",
        breadcrumb: `${table.name}`,
        icon: "all",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/fields`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/fields`,
        name: `Fields in ${table.name}`,
        breadcrumb: `${table.name}`,
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/questions`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/questions`,
        name: `Questions about ${table.name}`,
        breadcrumb: `${table.name}`,
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/history`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/history`,
        name: `Revision history`,
        breadcrumb: `${table.name}`,
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    }
} : {};

export const getEntitiesLoading = (state) => i.getIn(state, ['metadata', 'requestState', 'databases']) === "LOADING";

export const getEntitiesError = (state) => i.getIn(state, ['metadata', 'requestState', 'databases', 'error']);

export const getDatabaseId = (state) => state.router.params.databaseId;
export const getTableId = (state) => state.router.params.tableId;

const getReferenceSections = (state) => referenceSections;

const getSectionByPath = (sections, path) => sections.find(section => section.path === path || section.id === path);

const stripBasepath = (path) => path.slice('/reference/'.length);

export const getSectionId = (state) => state.router.location.pathname;

const getDatabases = (state) => state.metadata.databases;

const getDatabase = createSelector(
    [getDatabaseId, getDatabases],
    (databaseId, databases) => databases[databaseId]
);

const getTables = (database) => database && database.tables ?
    database.tables.reduce((tableMap, table) => i.assoc(tableMap, table.id, table), {}) :
    {};

const getTable = createSelector(
    [getTableId, getDatabase],
    (tableId, database) => getTables(database)[tableId]
);

export const getEntities = createSelector(
    [getSectionId, getDatabaseId, getDatabases],
    (sectionId, databaseId, databases) => {
        if (sectionId === `/reference/databases/${databaseId}/tables`) {
            return getTables(databases[databaseId]);
        }
        return databases;
    }
);

export const getEntity = createSelector(
    [getSectionId, getTableId, getDatabases, getDatabaseId],
    (sectionId, tableId, databases, databaseId) => {
        if (sectionId === `/reference/databases/${databaseId}/tables/${tableId}`) {
            return getTables(databases[databaseId])[tableId];
        }
        return databases[databaseId];
    }
);

export const getSections = createSelector(
    [getSectionId, getTable, getDatabase, getReferenceSections],
    (sectionId, table, database, referenceSections) =>
        referenceSections[sectionId] ? referenceSections :
            getDatabaseSections(database)[sectionId] ? getDatabaseSections(database) :
                getTableSections(database, table)
);

export const getSection = createSelector(
    [getSectionId, getSections],
    (sectionId, sections) => sections[sectionId] || {}
);

const getEntityRequestStates = (state) => i.getIn(state, ['metadata', 'requestState', 'database']);

export const getEntityLoading = createSelector(
    [getDatabaseId, getEntityRequestStates],
    (databaseId, entityRequestStates) => entityRequestStates[databaseId] === 'LOADING'
)

export const getEntityError = createSelector(
    [getDatabaseId, getEntityRequestStates],
    (databaseId, entityRequestStates) => i.getIn(entityRequestStates, [databaseId, 'error'])
)

const getBreadcrumb = (section, index, sections) => index !== sections.length - 1 ? [section.breadcrumb, section.id] : [section.breadcrumb];

const getParentSections = (section) => {
    if (!section.parent) {
        return [section];
    }

    const parentSections = []
        .concat(getParentSections(section.parent), section);

    return parentSections;
};

const buildBreadcrumbs = (section) => getParentSections(section).map(getBreadcrumb);

export const getBreadcrumbs = createSelector(
    [getSection],
    buildBreadcrumbs
)
