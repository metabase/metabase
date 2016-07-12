import { createSelector } from 'reselect';
import i from "icepick";

//TODO: definitely lots of memoization opportunities here

// there might be a better way to organize sections
// it feels like I'm duplicating a lot of routing logic here
const referenceSections = {
    // [`/reference/guide`]: {
    //     id: `/reference/guide`,
    //     name: "Understanding our data",
    //     breadcrumb: "Guide",
    //     icon: "all"
    // },
    [`/reference/metrics`]: {
        id: `/reference/metrics`,
        name: "Metrics",
        breadcrumb: "Metrics",
        // mapping of propname to args of dispatch function
        fetch: {fetchMetrics: []},
        get: 'getMetrics',
        icon: "star"
    },
    [`/reference/lists`]: {
        id: `/reference/lists`,
        name: "Lists",
        breadcrumb: "Lists",
        fetch: {fetchLists: []},
        get: 'getLists',
        icon: "recents"
    },
    [`/reference/databases`]: {
        id: `/reference/databases`,
        name: "Databases and tables",
        breadcrumb: "Databases",
        fetch: {fetchDatabases: []},
        get: 'getDatabases',
        icon: "mine"
    }
};

const getReferenceSections = (state) => referenceSections;

const getMetricSections = (metric) => metric ? {
    [`/reference/metrics/${metric.id}`]: {
        id: `/reference/metrics/${metric.id}`,
        name: 'Details',
        type: 'metric',
        breadcrumb: `${metric.name}`,
        fetch: {fetchMetrics: []},
        get: 'getMetric',
        icon: "all",
        parent: referenceSections[`/reference/metrics`]
    },
    [`/reference/metrics/${metric.id}/questions`]: {
        id: `/reference/metrics/${metric.id}/questions`,
        name: `Questions about ${metric.name}`,
        sidebar: 'Questions about this metric',
        breadcrumb: `${metric.name}`,
        fetch: {fetchMetrics: [], fetchQuestions: []},
        get: 'getMetricQuestions',
        icon: "all",
        parent: referenceSections[`/reference/metrics`]
    },
    [`/reference/metrics/${metric.id}/revisions`]: {
        id: `/reference/metrics/${metric.id}/revisions`,
        name: `Revision history for ${metric.name}`,
        sidebar: 'Revision history',
        breadcrumb: `${metric.name}`,
        fetch: {fetchMetrics: [], fetchRevisions: ['metric', metric.id], fetchTableMetadata: [metric.table_id]},
        get: 'getMetricRevisions',
        icon: "all",
        parent: referenceSections[`/reference/metrics`]
    }
} : {};

const getListSections = (list) => list ? {
    [`/reference/lists/${list.id}`]: {
        id: `/reference/lists/${list.id}`,
        name: 'Details',
        type: 'list',
        breadcrumb: `${list.name}`,
        fetch: {fetchLists: []},
        get: 'getList',
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    },
    [`/reference/lists/${list.id}/fields`]: {
        id: `/reference/lists/${list.id}/fields`,
        name: `Fields in ${list.name}`,
        sidebar: 'Fields in this list',
        // FIXME: breaks if we refresh on this route, looks like a race condition
        // due to fetchTableFields being dependent on list.table_id from fetchLists
        // resolves itself once we navigate away and back though
        fetch: {fetchLists: [], fetchTableFields: [list.table_id]},
        get: "getFieldsByList",
        breadcrumb: `${list.name}`,
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    },
    [`/reference/lists/${list.id}/questions`]: {
        id: `/reference/lists/${list.id}/questions`,
        name: `Questions about ${list.name}`,
        sidebar: 'Questions about this list',
        breadcrumb: `${list.name}`,
        fetch: {fetchLists: [], fetchQuestions: []},
        get: 'getListQuestions',
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    },
    [`/reference/lists/${list.id}/revisions`]: {
        id: `/reference/lists/${list.id}/revisions`,
        name: `Revision history for ${list.name}`,
        sidebar: 'Revision history',
        breadcrumb: `${list.name}`,
        fetch: {fetchLists: [], fetchRevisions: ['list', list.id], fetchTableMetadata: [list.table_id]},
        get: 'getListRevisions',
        icon: "all",
        parent: referenceSections[`/reference/lists`]
    }
} : {};

const getListFieldSections = (list, field) => list && field ? {
    [`/reference/lists/${list.id}/fields/${field.id}`]: {
        id: `/reference/lists/${list.id}/fields/${field.id}`,
        name: 'Details',
        type: 'field',
        breadcrumb: `${field.display_name}`,
        fetch: {fetchLists: [], fetchTableFields: [list.table_id]},
        get: "getFieldByList",
        icon: "star",
        parent: getListSections(list)[`/reference/lists/${list.id}/fields`]
    }
} : {};

const getDatabaseSections = (database) => database ? {
    [`/reference/databases/${database.id}`]: {
        id: `/reference/databases/${database.id}`,
        name: 'Details',
        type: 'database',
        breadcrumb: `${database.name}`,
        fetch: {fetchDatabaseMetadata: [database.id]},
        get: 'getDatabase',
        icon: "all",
        parent: referenceSections[`/reference/databases`]
    },
    [`/reference/databases/${database.id}/tables`]: {
        id: `/reference/databases/${database.id}/tables`,
        name: `Tables in ${database.name}`,
        sidebar: 'Tables in this database',
        breadcrumb: `${database.name}`,
        fetch: {fetchDatabaseMetadata: [database.id]},
        get: 'getTablesByDatabase',
        icon: "star",
        parent: referenceSections[`/reference/databases`]
    }
} : {};

const getTableSections = (database, table) => database && table ? {
    [`/reference/databases/${database.id}/tables/${table.id}`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}`,
        name: 'Details',
        type: 'table',
        breadcrumb: `${table.display_name}`,
        fetch: {fetchDatabaseMetadata: [database.id]},
        get: 'getTable',
        icon: "all",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/fields`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/fields`,
        name: `Fields in ${table.display_name}`,
        sidebar: 'Fields in this table',
        breadcrumb: `${table.display_name}`,
        fetch: {fetchDatabaseMetadata: [database.id]},
        get: "getFields",
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/questions`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/questions`,
        name: `Questions about ${table.display_name}`,
        sidebar: 'Questions about this table',
        breadcrumb: `${table.display_name}`,
        fetch: {fetchDatabaseMetadata: [database.id], fetchQuestions: []},
        get: 'getTableQuestions',
        icon: "star",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    }
} : {};

const getTableFieldSections = (database, table, field) => database && table && field ? {
    [`/reference/databases/${database.id}/tables/${table.id}/fields/${field.id}`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/fields/${field.id}`,
        name: 'Details',
        type: 'field',
        breadcrumb: `${field.display_name}`,
        fetch: {fetchDatabaseMetadata: [database.id]},
        get: "getField",
        icon: "star",
        parent: getTableSections(database, table)[`/reference/databases/${database.id}/tables/${table.id}/fields`]
    }
} : {};

export const getSectionId = (state) => state.router.location.pathname;

export const getMetricId = (state) => state.router.params.metricId;
const getMetrics = (state) => state.metadata.metrics;
export const getMetric = createSelector(
    [getMetricId, getMetrics],
    (metricId, metrics) => metrics[metricId] || { id: metricId }
);

export const getListId = (state) => state.router.params.listId;
const getLists = (state) => state.metadata.lists;
export const getList = createSelector(
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
export const getTables = (state) => state.metadata.tables;
const getTablesByDatabase = createSelector(
    [getTables, getDatabase],
    (tables, database) => tables && database ? Object.values(tables)
        .filter(table => table.db_id === database.id)
        .reduce((tableMap, table) => i.assoc(tableMap, table.id, table), {}) : {}
);

const getTable = createSelector(
    [getTableId, getTables],
    (tableId, tables) => tables[tableId] || { id: tableId }
);
const getTableByList = createSelector(
    [getList, getTables],
    (list, tables) => list ? tables[list.table_id] : {}
);

export const getFieldId = (state) => state.router.params.fieldId;
const getFields = createSelector(
    [getTable],
    (table) => table && table.fields ?
        table.fields.reduce((fieldMap, field) => i.assoc(fieldMap, field.id, field), {}) : {}
);
const getFieldsByList = createSelector(
    [getTableByList],
    (table) => table && table.fields ?
        table.fields.reduce((fieldMap, field) => i.assoc(fieldMap, field.id, field), {}) : {}
);
const getField = createSelector(
    [getFieldId, getFields],
    (fieldId, fields) => fields[fieldId] || { id: fieldId }
);
const getFieldByList = createSelector(
    [getFieldId, getFieldsByList],
    (fieldId, fields) => fields[fieldId] || { id: fieldId }
);

const getQuestions = (state) => i.getIn(state, ['questions', 'entities', 'cards']) || {};
// TODO: get someone to look over this
// probably not be the best way to determine which questions are associated
// with a particular metric/list, but seems to work
const filterMetricQuestions = (metricId, question) => {
    const aggregation = i.getIn(question, ['dataset_query', 'query', 'aggregation']);
    if (!aggregation) {
        return false;
    }

    return aggregation[0] === "METRIC" && aggregation[1].toString() === metricId;
};

const getMetricQuestions = createSelector(
    [getMetricId, getQuestions],
    (metricId, questions) => Object.values(questions)
        .filter(question => filterMetricQuestions(metricId, question))
        .reduce((map, question) => i.assoc(map, question.id, question), {})
);

const getRevisions = (state) => state.metadata.revisions;

const getMetricRevisions = createSelector(
    [getMetricId, getRevisions],
    (metricId, revisions) => i.getIn(revisions, ['metric', metricId]) || {}
);

const getListRevisions = createSelector(
    [getListId, getRevisions],
    (listId, revisions) => i.getIn(revisions, ['list', listId]) || {}
);

const filterListQuestions = (listId, question) => {
    const filter = i.getIn(question, ['dataset_query', 'query', 'filter']);
    if (!filter) {
        return false;
    }
    if (filter[0] === "AND") {
        const filters = filter.slice(1);
        const matchingFilters = filters
            .filter(filter => filter[0] === "SEGMENT" && filter[1].toString() === listId);

        return matchingFilters.length === 1;
    }

    return filter[0] === "SEGMENT" && filter[1].toString() === listId;
};

const getListQuestions = createSelector(
    [getListId, getQuestions],
    (listId, questions) => Object.values(questions)
        .filter(question => filterListQuestions(listId, question))
        .reduce((map, question) => i.assoc(map, question.id, question), {})
);

const getTableQuestions = createSelector(
    [getTable, getQuestions],
    (table, questions) => Object.values(questions)
        .filter(question => question.table_id === table.id)
);

export const getSections = createSelector(
    [getSectionId, getMetric, getList, getDatabase, getTable, getField, getFieldByList, getReferenceSections],
    (sectionId, metric, list, database, table, field, fieldByList, referenceSections) => {
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

        const listFieldSections = getListFieldSections(list, fieldByList);
        if (listFieldSections[sectionId]) {
            return listFieldSections;
        }

        const databaseSections = getDatabaseSections(database);
        if (databaseSections[sectionId]) {
            return databaseSections;
        }

        const tableSections = getTableSections(database, table);
        if (tableSections[sectionId]) {
            return tableSections;
        }

        const tableFieldSections = getTableFieldSections(database, table, field);
        if (tableFieldSections[sectionId]) {
            return tableFieldSections;
        }

        return {};
    }
);

export const getSection = createSelector(
    [getSectionId, getSections],
    (sectionId, sections) => sections[sectionId] || {}
);

const dataSelectors = {
    getMetric,
    getMetricQuestions,
    getMetricRevisions,
    getMetrics,
    getList,
    getListQuestions,
    getListRevisions,
    getLists,
    getDatabase,
    getDatabases,
    getTable,
    getTableQuestions,
    getTables,
    getTablesByDatabase,
    getField,
    getFieldByList,
    getFields,
    getFieldsByList
};

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

const mapFetchToRequestStatePaths = (fetch) => fetch ?
    Object.keys(fetch).map(key => {
        switch(key) {
            case 'fetchQuestions':
                return ['questions', 'fetch'];
            case 'fetchMetrics':
                return ['metadata', 'metrics', 'fetch'];
            case 'fetchRevisions':
                return ['metadata', 'revisions', fetch[key[0]], fetch[key[1]], 'fetch'];
            case 'fetchLists':
                return ['metadata', 'lists', 'fetch'];
            case 'fetchDatabases':
                return ['metadata', 'databases', 'fetch'];
            case 'fetchDatabaseMetadata':
                return ['metadata', 'databases', fetch[key], 'fetch'];
            case 'fetchTableMetadata':
                return ['metadata', 'tables', fetch[key], 'fetch'];
            case 'fetchTableFields':
                return ['metadata', 'tables', fetch[key], 'fields', 'fetch'];
            default:
                return [];
        }
    }) : [];

const getRequests = (state) => i.getIn(state, ['requests']);

const getRequestPaths = createSelector(
    [getSection],
    (section) => mapFetchToRequestStatePaths(section.fetch)
);

export const getLoading = createSelector(
    [getRequestPaths, getRequests],
    (requestPaths, requests) => requestPaths
        .reduce((isLoading, requestPath) =>
            isLoading ||
            i.getIn(requests, requestPath.concat('state')) === 'LOADING', false)
)

export const getError = createSelector(
    [getRequestPaths, getRequests],
    (requestPaths, requests) => requestPaths
        .reduce((error, requestPath) => error || i.getIn(requests, requestPath.concat('error')), undefined)
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

const buildBreadcrumbs = (section) => getParentSections(section)
    .map(getBreadcrumb)
    .slice(-3);

export const getBreadcrumbs = createSelector(
    [getSection],
    buildBreadcrumbs
)

export const getHasDisplayName = createSelector(
    [getSection],
    (section) =>
        section.type === 'database' ||
        section.type === 'table' ||
        section.type === 'field'
)

export const getUser = (state) => state.currentUser;

export const getIsEditing = (state) => state.reference.isEditing;
