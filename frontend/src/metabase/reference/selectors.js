import { createSelector } from 'reselect';
import { assoc, getIn } from "icepick";
import { getDashboardListing } from "../dashboards/selectors";

import Query, { AggregationClause } from 'metabase/lib/query';
import {
    resourceListToMap
} from 'metabase/lib/redux';

import {
    idsToObjectMap,
    databaseToForeignKeys
} from "./utils";

// import { getDatabases, getTables, getFields, getMetrics, getSegments } from "metabase/selectors/metadata";

import { getShallowDatabases as getDatabases, getShallowTables as getTables, getShallowFields as getFields, getShallowMetrics as getMetrics, getShallowSegments as getSegments } from "metabase/selectors/metadata";
export { getShallowDatabases as getDatabases, getShallowTables as getTables, getShallowFields as getFields, getShallowMetrics as getMetrics, getShallowSegments as getSegments } from "metabase/selectors/metadata";

import _ from "underscore";


// there might be a better way to organize sections
// it feels like I'm duplicating a lot of routing logic here
//TODO: refactor to use different container components for each section
// initialize section metadata in there
// may not be worthwhile due to the extra boilerplate required
// try using a higher-order component to reduce boilerplate?
const referenceSections = {
    [`/reference/guide`]: {
        id: `/reference/guide`,
        name: "Start here",
        fetch: {
            fetchGuide: [],
            fetchDashboards: [],
            fetchMetrics: [],
            fetchSegments: [],
            fetchDatabasesWithMetadata: []
        },
        icon: "reference",
    },
    [`/reference/metrics`]: {
        id: `/reference/metrics`,
        name: "Metrics",
        // mapping of propname to args of dispatch function
        fetch: {
            fetchMetrics: [],
            fetchSegments: []
        },
        get: 'getMetrics',
        icon: "ruler"
    },
    [`/reference/segments`]: {
        id: `/reference/segments`,
        name: "Segments",
        fetch: {
            fetchMetrics: [],
            fetchSegments: []
        },
        get: 'getSegments',
        icon: "segment"
    },
    [`/reference/databases`]: {
        id: `/reference/databases`,
        name: "Databases and tables",
        fetch: {
            fetchMetrics: [],
            fetchSegments: [],
            fetchDatabases: []
        },
        get: 'getDatabases',
        icon: "database",
        itemIcon: "database"
    }
};

const getReferenceSections = (state, props) => referenceSections;

const getMetricSections = (metric, table, user) => metric ? {
    [`/reference/metrics/${metric.id}`]: {
        id: `/reference/metrics/${metric.id}`,
        name: 'Details',
        update: 'updateMetric',
        type: 'metric',
        fetch: {
            fetchMetricTable: [metric.id],
            // currently the only way to fetch metrics important fields
            fetchGuide: [],
            fetchMetrics: []
        },
        get: 'getMetric',
        icon: "document",
        headerIcon: "ruler",
        parent: referenceSections[`/reference/metrics`]
    },
    [`/reference/metrics/${metric.id}/questions`]: {
        id: `/reference/metrics/${metric.id}/questions`,
        name: `Questions about ${metric.name}`,
        type: 'questions',
        fetch: {
            fetchMetricTable: [metric.id],
            fetchQuestions: [],
            fetchMetrics: []
        },
        get: 'getMetricQuestions',
        icon: "all",
        headerIcon: "ruler",
        parent: referenceSections[`/reference/metrics`]
    },
    [`/reference/metrics/${metric.id}/revisions`]: {
        id: `/reference/metrics/${metric.id}/revisions`,
        name: `Revision history for ${metric.name}`,
        hidden: user && !user.is_superuser,
        fetch: {
            fetchMetricRevisions: [metric.id],
            fetchMetrics: []
        },
        get: 'getMetricRevisions',
        icon: "history",
        headerIcon: "ruler",
        parent: referenceSections[`/reference/metrics`]
    }
} : {};

const getSegmentSections = (segment, table, user) => segment ? {
    [`/reference/segments/${segment.id}`]: {
        id: `/reference/segments/${segment.id}`,
        name: 'Details',
        update: 'updateSegment',
        type: 'segment',
        fetch: {
            fetchSegmentTable: [segment.id]
        },
        get: 'getSegment',
        icon: "document",
        headerIcon: "segment",
        parent: referenceSections[`/reference/segments`]
    },
    [`/reference/segments/${segment.id}/fields`]: {
        id: `/reference/segments/${segment.id}/fields`,
        name: `Fields in ${segment.name}`,
        fetch: {
            fetchSegmentFields: [segment.id]
        },
        get: "getFieldsBySegment",
        icon: "fields",
        headerIcon: "segment",
        parent: referenceSections[`/reference/segments`]
    },
    [`/reference/segments/${segment.id}/questions`]: {
        id: `/reference/segments/${segment.id}/questions`,
        name: `Questions about ${segment.name}`,
        type: 'questions',
        fetch: {
            fetchSegmentTable: [segment.id],
            fetchQuestions: []
        },
        get: 'getSegmentQuestions',
        icon: "all",
        headerIcon: "segment",
        parent: referenceSections[`/reference/segments`]
    },
    [`/reference/segments/${segment.id}/revisions`]: {
        id: `/reference/segments/${segment.id}/revisions`,
        name: `Revision history for ${segment.name}`,
        hidden: user && !user.is_superuser,
        fetch: {
            fetchSegmentRevisions: [segment.id]
        },
        get: 'getSegmentRevisions',
        icon: "history",
        headerIcon: "segment",
        parent: referenceSections[`/reference/segments`]
    }
} : {};

const getSegmentFieldSections = (segment, table, field, user) => segment && field ? {
    [`/reference/segments/${segment.id}/fields/${field.id}`]: {
        id: `/reference/segments/${segment.id}/fields/${field.id}`,
        name: 'Details',
        update: 'updateField',
        type: 'field',
        fetch: {
            fetchSegmentFields: [segment.id]
        },
        get: "getFieldBySegment",
        icon: "document",
        headerIcon: "field",
        parent: getSegmentSections(segment)[`/reference/segments/${segment.id}/fields`]
    }
} : {};

const getDatabaseSections = (database) => database ? {
    [`/reference/databases/${database.id}`]: {
        id: `/reference/databases/${database.id}`,
        name: 'Details',
        update: 'updateDatabase',
        type: 'database',
        // fetch: {
        //     fetchDatabaseMetadata: [database.id]
        // },
        get: 'getDatabase',
        icon: "document",
        headerIcon: "database",
        parent: referenceSections[`/reference/databases`]
    },
    [`/reference/databases/${database.id}/tables`]: {
        id: `/reference/databases/${database.id}/tables`,
        name: `Tables in ${database.name}`,
        type: 'tables',
        // fetch: {
        //     fetchDatabaseMetadata: [database.id]
        // },
        get: 'getTablesByDatabase',
        icon: "table2",
        headerIcon: "database",
        parent: referenceSections[`/reference/databases`]
    }
} : {};

const getTableSections = (database, table) => database && table ? {
    [`/reference/databases/${database.id}/tables/${table.id}`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}`,
        name: 'Details',
        update: 'updateTable',
        type: 'table',
        // fetch: {
        //     fetchDatabaseMetadata: [database.id]
        // },
        get: 'getTable',
        icon: "document",
        headerIcon: "table2",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/fields`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/fields`,
        name: `Fields in ${table.display_name}`,
        // fetch: {
        //     fetchDatabaseMetadata: [database.id]
        // },
        get: "getFieldsByTable",
        icon: "fields",
        headerIcon: "table2",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    },
    [`/reference/databases/${database.id}/tables/${table.id}/questions`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/questions`,
        name: `Questions about ${table.display_name}`,
        type: 'questions',
        // fetch: {
        //     fetchDatabaseMetadata: [database.id], fetchQuestions: []
        // },
        get: 'getTableQuestions',
        icon: "all",
        headerIcon: "table2",
        parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
    }
} : {};

const getTableFieldSections = (database, table, field) => database && table && field ? {
    [`/reference/databases/${database.id}/tables/${table.id}/fields/${field.id}`]: {
        id: `/reference/databases/${database.id}/tables/${table.id}/fields/${field.id}`,
        name: 'Details',
        update: 'updateField',
        type: 'field',
        // fetch: {
        //     fetchDatabaseMetadata: [database.id]
        // },
        get: "getField",
        icon: "document",
        headerIcon: "field",
        parent: getTableSections(database, table)[`/reference/databases/${database.id}/tables/${table.id}/fields`]
    }
} : {};

export const getUser = (state, props) => state.currentUser;

export const getSectionId = (state, props) => props.location.pathname;

export const getMetricId = (state, props) => Number.parseInt(props.params.metricId);
export const getMetric = createSelector(
    [getMetricId, getMetrics],
    (metricId, metrics) => metrics[metricId] || { id: metricId }
);

export const getSegmentId = (state, props) => Number.parseInt(props.params.segmentId);
export const getSegment = createSelector(
    [getSegmentId, getSegments],
    (segmentId, segments) => segments[segmentId] || { id: segmentId }
);

export const getDatabaseId = (state, props) => Number.parseInt(props.params.databaseId);

export const getDatabase = createSelector(
    [getDatabaseId, getDatabases],
    (databaseId, databases) => databases[databaseId] || { id: databaseId }
);

export const getTableId = (state, props) => Number.parseInt(props.params.tableId);
// export const getTableId = (state, props) => Number.parseInt(props.params.tableId);
export const getTablesByDatabase = createSelector(
    [getTables, getDatabase],
    (tables, database) => tables && database && database.tables ?
        idsToObjectMap(database.tables, tables) : {}
);
export const getTableBySegment = createSelector(
    [getSegment, getTables],
    (segment, tables) => segment && segment.table_id ? tables[segment.table_id] : {}
);
const getTableByMetric = createSelector(
    [getMetric, getTables],
    (metric, tables) => metric && metric.table_id ? tables[metric.table_id] : {}
);
export const getTable = createSelector(
    [getTableId, getTables, getMetricId, getTableByMetric, getSegmentId, getTableBySegment],
    (tableId, tables, metricId, tableByMetric, segmentId, tableBySegment) => tableId ?
        tables[tableId] || { id: tableId } :
        metricId ? tableByMetric :
            segmentId ? tableBySegment : {}
);

export const getFieldId = (state, props) => Number.parseInt(props.params.fieldId);
export const getFieldsByTable = createSelector(
    [getTable, getFields],
    (table, fields) => table && table.fields ? idsToObjectMap(table.fields, fields) : {}
);
export const getFieldsBySegment = createSelector(
    [getTableBySegment, getFields],
    (table, fields) => table && table.fields ? idsToObjectMap(table.fields, fields) : {}
);
export const getField = createSelector(
    [getFieldId, getFields],
    (fieldId, fields) => fields[fieldId] || { id: fieldId }
);
export const getFieldBySegment = createSelector(
    [getFieldId, getFieldsBySegment],
    (fieldId, fields) => fields[fieldId] || { id: fieldId }
);

const getQuestions = (state, props) => getIn(state, ['questions', 'entities', 'cards']) || {};

export const getMetricQuestions = createSelector(
    [getMetricId, getQuestions],
    (metricId, questions) => Object.values(questions)
        .filter(question =>
            question.dataset_query.type === "query" &&
            _.any(Query.getAggregations(question.dataset_query.query), (aggregation) =>
                AggregationClause.getMetric(aggregation) === metricId
            )
        )
        .reduce((map, question) => assoc(map, question.id, question), {})
);

const getRevisions = (state, props) => state.metadata.revisions;

export const getMetricRevisions = createSelector(
    [getMetricId, getRevisions],
    (metricId, revisions) => getIn(revisions, ['metric', metricId]) || {}
);

export const getSegmentRevisions = createSelector(
    [getSegmentId, getRevisions],
    (segmentId, revisions) => getIn(revisions, ['segment', segmentId]) || {}
);

export const getSegmentQuestions = createSelector(
    [getSegmentId, getQuestions],
    (segmentId, questions) => Object.values(questions)
        .filter(question =>
            question.dataset_query.type === "query" &&
            Query.getFilters(question.dataset_query.query)
                .some(filter => Query.isSegmentFilter(filter) && filter[1] === segmentId)
        )
        .reduce((map, question) => assoc(map, question.id, question), {})
);

export const getTableQuestions = createSelector(
    [getTable, getQuestions],
    (table, questions) => Object.values(questions)
        .filter(question => question.table_id === table.id)
);

const getDatabaseBySegment = createSelector(
    [getSegment, getTables, getDatabases],
    (segment, tables, databases) => segment && segment.table_id && tables[segment.table_id] &&
        databases[tables[segment.table_id].db_id] || {}
);

const getForeignKeysBySegment = createSelector(
    [getDatabaseBySegment],
    databaseToForeignKeys
);

const getForeignKeysByDatabase = createSelector(
    [getDatabase],
    databaseToForeignKeys
);

export const getForeignKeys = createSelector(
    [getSegmentId, getForeignKeysBySegment, getForeignKeysByDatabase],
    (segmentId, foreignKeysBySegment, foreignKeysByDatabase) => segmentId ?
        foreignKeysBySegment : foreignKeysByDatabase
)

export const getSections = createSelector(
    [getSectionId, getMetric, getSegment, getDatabase, getTable, getField, getFieldBySegment, getTableBySegment, getTableByMetric, getUser, getReferenceSections, getSegments, getMetrics],
    (sectionId, metric, segment, database, table, field, fieldBySegment, tableBySegment, tableByMetric, user, referenceSections, segments, metrics) => {
        // can be simplified if we had a single map of all sections
        if (referenceSections[sectionId]) {
            // filter out segments or metrics if we're not on that particular section and there are none
            return _.omit(referenceSections,
                Object.keys(metrics).length === 0 && sectionId !== "/reference/metrics" && "/reference/metrics",
                Object.keys(segments).length === 0 && sectionId !== "/reference/segments"  && "/reference/segments",
            );
        }

        const metricSections = getMetricSections(metric, tableByMetric, user);
        if (metricSections[sectionId]) {
            return metricSections;
        }

        const segmentSections = getSegmentSections(segment, tableBySegment, user);
        if (segmentSections[sectionId]) {
            return segmentSections;
        }

        const segmentFieldSections = getSegmentFieldSections(segment, tableBySegment, fieldBySegment);
        if (segmentFieldSections[sectionId]) {
            return segmentFieldSections;
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


export const getLoading = (state, props) => state.reference.isLoading;

export const getError = (state, props) => state.reference.error;

export const getHasSingleSchema = createSelector(
    [getTablesByDatabase],
    (tables) => tables && Object.keys(tables).length > 0 ?
        Object.values(tables)
            .every((table, index, tables) => table.schema === tables[0].schema) : true
)

export const getIsEditing = (state, props) => state.reference.isEditing;

export const getIsFormulaExpanded = (state, props) => state.reference.isFormulaExpanded;

export const getGuide = (state, props) => state.reference.guide;

export const getDashboards = (state, props) => getDashboardListing(state) && resourceListToMap(getDashboardListing(state));

export const getIsDashboardModalOpen = (state, props) => state.reference.isDashboardModalOpen;
