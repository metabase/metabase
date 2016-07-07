import { createSelector } from 'reselect';
import i from "icepick";

//TODO: definitely lots of memoization opportunities here

// there might be a better way to organize sections
// maybe merge all of them into a single map for simpler lookup?
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
        // seems to work well but might be a bit naive?
        fetch: 'fetchMetrics',
        get: 'getMetrics',
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
        fetch: 'fetchDatabases',
        get: 'getDatabases',
        icon: "mine"
    }
};

const getReferenceSections = (state) => referenceSections;

const getMetricSections = (metric) => metric ? {
    [`/reference/metrics/${metric.id}`]: {
        id: `/reference/metrics/${metric.id}`,
        name: "Details",
        breadcrumb: `${metric.name}`,
        fetch: 'fetchMetrics',
        get: 'getMetric',
        icon: "all",
        parent: referenceSections[`/reference/metrics`]
    },
    [`/reference/metrics/${metric.id}/questions`]: {
        id: `/reference/metrics/${metric.id}/questions`,
        name: "Questions about this metric",
        breadcrumb: `${metric.name}`,
        icon: "all",
        parent: referenceSections[`/reference/metrics`]
    },
    [`/reference/metrics/${metric.id}/history`]: {
        id: `/reference/metrics/${metric.id}/history`,
        name: "Revision history",
        breadcrumb: `${metric.name}`,
        icon: "all",
        parent: referenceSections[`/reference/metrics`]
    }
} : {};

const getListSections = (list) => list ? {
    [`/reference/lists/${list.id}`]: {
        id: `/reference/lists/${list.id}`,
        name: "Details",
        breadcrumb: `${list.name}`,
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    },
    [`/reference/lists/${list.id}/fields`]: {
        id: `/reference/lists/${list.id}/fields`,
        name: "Fields in this list",
        breadcrumb: `${list.name}`,
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    },
    [`/reference/lists/${list.id}/questions`]: {
        id: `/reference/lists/${list.id}/questions`,
        name: "Questions about this list",
        breadcrumb: `${list.name}`,
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    },
    [`/reference/lists/${list.id}/history`]: {
        id: `/reference/lists/${list.id}/history`,
        name: "Revision history",
        breadcrumb: `${list.name}`,
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    }
} : {};

const getDatabaseSections = (database) => database ? {
    [`/reference/databases/${database.id}`]: {
        id: `/reference/databases/${database.id}`,
        name: "Details",
        breadcrumb: `${database.name}`,
        fetch: 'fetchDatabaseMetadata',
        fetchArgs: [database.id],
        get: 'getDatabase',
        icon: "all",
        parent: referenceSections[`/reference/databases`]
    },
    [`/reference/databases/${database.id}/tables`]: {
        id: `/reference/databases/${database.id}/tables`,
        name: `Tables in this database`,
        breadcrumb: `${database.name}`,
        fetch: 'fetchDatabaseMetadata',
        fetchArgs: [database.id],
        get: 'getTables',
        icon: "star",
        parent: referenceSections[`/reference/databases`]
    }
} : {};

const getTableSections = (database, table) => database && table ? {
    [`/reference/databases/${database.id}/tables/${table.id}`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}`,
        name: "Details",
        breadcrumb: `${table.name}`,
        fetch: 'fetchDatabaseMetadata',
        fetchArgs: [database.id],
        get: 'getTable',
        icon: "all",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/fields`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/fields`,
        name: `Fields in this table`,
        breadcrumb: `${table.name}`,
        fetch: 'fetchDatabaseMetadata',
        fetchArgs: [database.id],
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/questions`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/questions`,
        name: `Questions about this table`,
        breadcrumb: `${table.name}`,
        fetch: 'fetchDatabaseMetadata',
        fetchArgs: [database.id],
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/history`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/history`,
        name: `Revision history`,
        breadcrumb: `${table.name}`,
        fetch: 'fetchDatabaseMetadata',
        fetchArgs: [database.id],
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    }
} : {};

export const getSectionId = (state) => state.router.location.pathname;

export const getMetricId = (state) => state.router.params.metricId;
const getMetrics = (state) => state.metadata.metrics;
const getMetric = createSelector(
    [getMetricId, getMetrics],
    (metricId, metrics) => metrics[metricId] || { id: metricId }
);

export const getListId = (state) => state.router.params.listId;
const getLists = (state) => state.metadata.lists;
const getList = createSelector(
    [getListId, getLists],
    (listId, lists) => lists[listId] || { id: listId }
);

export const getDatabaseId = (state) => state.router.params.databaseId;
const getDatabases = (state) => state.metadata.databases;
const getDatabase = createSelector(
    [getDatabaseId, getDatabases],
    (databaseId, databases) => databases[databaseId] || { id: databaseId }
);

export const getTableId = (state) => state.router.params.tableId;
const getTables = createSelector(
    [getDatabase],
    (database) => database && database.tables ?
        database.tables.reduce((tableMap, table) => i.assoc(tableMap, table.id, table), {}) : {}
);

const getTable = createSelector(
    [getTableId, getTables],
    (tableId, tables) => tables[tableId] || { id: tableId }
);

const dataSelectors = {
    getMetric,
    getMetrics,
    getList,
    getLists,
    getDatabase,
    getDatabases,
    getTable,
    getTables
};

export const getSections = createSelector(
    [getSectionId, getMetric, getList, getDatabase, getTable, getReferenceSections],
    (sectionId, metric, list, database, table, referenceSections) => {
        // can be simplified if we had a single map of all sections
        if (referenceSections[sectionId]) {
            return referenceSections;
        }

        const metricSections = getMetricSections(metric);
        if (metricSections[sectionId]) {
            return metricSections;
        }

        const listSections = getListSections(list);
        if (listSections[sectionId]) {
            return listSections;
        }

        const databaseSections = getDatabaseSections(database);
        if (databaseSections[sectionId]) {
            return databaseSections;
        }

        const tableSections = getTableSections(database, table);
        if (tableSections[sectionId]) {
            return tableSections;
        }

        return {};
    }
);

export const getSection = createSelector(
    [getSectionId, getSections],
    (sectionId, sections) => sections[sectionId] || {}
);

export const getData = (state) => {
    const section = getSection(state);
    if (!section) {
        return {};
    }
    const selector = dataSelectors[section.get];
    if (!selector) {
        return {};
    }

    return selector(state);
};

const mapFetchToRequestStatePath = (fetch, fetchArgs = []) => {
    switch(fetch) {
        case 'fetchMetrics':
            return ['metrics'];
        case 'fetchDatabases':
            return ['databases'];
        case 'fetchDatabaseMetadata':
            return ['database'].concat(fetchArgs);
        default:
            return [];
    }
};

const getRequestStates = (state) => i.getIn(state, ['metadata', 'requestState']);

const getRequestStatePath = createSelector(
    [getSection],
    (section) => mapFetchToRequestStatePath(section.fetch, section.fetchArgs)
);

export const getLoading = createSelector(
    [getRequestStatePath, getRequestStates],
    (requestStatePath, requestStates) => requestStates &&
        i.getIn(requestStates, requestStatePath) === 'LOADING'
)

export const getError = createSelector(
    [getRequestStatePath, getRequestStates],
    (requestStatePath, requestStates) => requestStates ?
        i.getIn(requestStates, requestStatePath.concat('error')) : false
)

const getBreadcrumb = (section, index, sections) => index !== sections.length - 1 ?
    [section.breadcrumb, section.id] : [section.breadcrumb];

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
