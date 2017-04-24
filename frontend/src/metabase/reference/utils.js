import { assoc, assocIn, chain } from "icepick";
import _ from "underscore";

import { titleize, humanize } from "metabase/lib/formatting";
import { startNewCard } from "metabase/lib/card";
import { isPK } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";

export const idsToObjectMap = (ids, objects) => ids
    .map(id => objects[id])
    .reduce((map, object) => ({ ...map, [object.id]: object }), {});
    // recursive freezing done by assoc here is too expensive
    // hangs browser for large databases
    // .reduce((map, object) => assoc(map, object.id, object), {});

const filterUntouchedFields = (fields, entity = {}) => Object.keys(fields)
    .filter(key =>
        fields[key] !== undefined &&
        entity[key] !== fields[key]
    )
    .reduce((map, key) => ({ ...map, [key]: fields[key] }), {});

const isEmptyObject = (object) => Object.keys(object).length === 0;

export const tryFetchData = async (props) => {
    const {
        section,
        clearError,
        startLoading,
        setError,
        endLoading
    } = props;

    if (!(section && section.fetch)) {
        return;
    }

    const fetch = section.fetch;
    clearError();
    startLoading();
    try {
        await Promise.all(Object.keys(fetch).map((fetchPropName) => {
            const fetchData = props[fetchPropName];
            const fetchArgs = fetch[fetchPropName] || [];
            return fetchData(...fetchArgs);
        }));
    }
    catch(error) {
        setError(error);
        console.error(error);
    }

    endLoading();
}

export const tryUpdateData = async (fields, props) => {
    const {
        entity,
        guide,
        section,
        updateMetricImportantFields,
        startLoading,
        endLoading,
        resetForm,
        setError,
        endEditing
    } = props;

    startLoading();
    try {
        const editedFields = filterUntouchedFields(fields, entity);
        if (!isEmptyObject(editedFields)) {
            const newEntity = {...entity, ...editedFields};
            await props[section.update](newEntity);

            if (section.type === 'metric' && fields.important_fields) {
                const importantFieldIds = fields.important_fields.map(field => field.id);
                const existingImportantFieldIds = guide.metric_important_fields && guide.metric_important_fields[entity.id];

                const areFieldIdsIdentitical = existingImportantFieldIds &&
                    existingImportantFieldIds.length === importantFieldIds.length &&
                    existingImportantFieldIds.every(id => importantFieldIds.includes(id));

                if (!areFieldIdsIdentitical) {
                    await updateMetricImportantFields(entity.id, importantFieldIds);
                    tryFetchData(props);
                }
            }
        }
    }
    catch(error) {
        setError(error);
        console.error(error);
    }

    resetForm();
    endLoading();
    endEditing();
}

export const tryUpdateFields = async (formFields, props) => {
    const {
        entities,
        updateField,
        startLoading,
        endLoading,
        endEditing,
        resetForm,
        setError
    } = props;

    startLoading();
    try {
        const updatedFields = Object.keys(formFields)
            .map(fieldId => ({
                field: entities[fieldId],
                formField: filterUntouchedFields(formFields[fieldId], entities[fieldId])
            }))
            .filter(({field, formField}) => !isEmptyObject(formField))
            .map(({field, formField}) => ({...field, ...formField}));

        await Promise.all(updatedFields.map(updateField));
    }
    catch(error) {
        setError(error);
        console.error(error);
    }

    resetForm();
    endLoading();
    endEditing();
}

export const tryUpdateGuide = async (formFields, props) => {
    const {
        guide,
        dashboards,
        metrics,
        segments,
        tables,
        startLoading,
        endLoading,
        endEditing,
        setError,
        resetForm,
        updateDashboard,
        updateMetric,
        updateSegment,
        updateTable,
        updateMetricImportantFields,
        updateSetting,
        fetchGuide,
        clearRequestState
    } = props;

    startLoading();
    try {
        const updateNewEntities = ({
            entities,
            formFields,
            updateEntity
        }) => formFields.map(formField => {
            if (!formField.id) {
                return [];
            }

            const editedEntity = filterUntouchedFields(
                assoc(formField, 'show_in_getting_started', true),
                entities[formField.id]
            );

            if (isEmptyObject(editedEntity)) {
                return [];
            }

            const newEntity = entities[formField.id];
            const updatedNewEntity = {
                ...newEntity,
                ...editedEntity
            };

            const updatingNewEntity = updateEntity(updatedNewEntity);

            return [updatingNewEntity];
        });

        const updateOldEntities = ({
            newEntityIds,
            oldEntityIds,
            entities,
            updateEntity
        }) => oldEntityIds
            .filter(oldEntityId => !newEntityIds.includes(oldEntityId))
            .map(oldEntityId => {
                const oldEntity = entities[oldEntityId];

                const updatedOldEntity = assoc(
                    oldEntity,
                    'show_in_getting_started',
                    false
                );

                const updatingOldEntity = updateEntity(updatedOldEntity);

                return [updatingOldEntity];
            });
        //FIXME: necessary because revision_message is a mandatory field
        // even though we don't actually keep track of changes to caveats/points_of_interest yet
        const updateWithRevisionMessage = updateEntity => entity => updateEntity(assoc(
            entity,
            'revision_message',
            'Updated in Getting Started guide.'
        ));

        const updatingDashboards = updateNewEntities({
                entities: dashboards,
                formFields: [formFields.most_important_dashboard],
                updateEntity: updateDashboard
            })
            .concat(updateOldEntities({
                newEntityIds: formFields.most_important_dashboard ?
                    [formFields.most_important_dashboard.id] : [],
                oldEntityIds: guide.most_important_dashboard ?
                    [guide.most_important_dashboard] :
                    [],
                entities: dashboards,
                updateEntity: updateDashboard
            }));

        const updatingMetrics = updateNewEntities({
                entities: metrics,
                formFields: formFields.important_metrics,
                updateEntity: updateWithRevisionMessage(updateMetric)
            })
            .concat(updateOldEntities({
                newEntityIds: formFields.important_metrics
                    .map(formField => formField.id),
                oldEntityIds: guide.important_metrics,
                entities: metrics,
                updateEntity: updateWithRevisionMessage(updateMetric)
            }));

        const updatingMetricImportantFields = formFields.important_metrics
            .map(metricFormField => {
                if (!metricFormField.id || !metricFormField.important_fields) {
                    return [];
                }
                const importantFieldIds = metricFormField.important_fields
                    .map(field => field.id);
                const existingImportantFieldIds = guide.metric_important_fields[metricFormField.id];

                const areFieldIdsIdentitical = existingImportantFieldIds &&
                    existingImportantFieldIds.length === importantFieldIds.length &&
                    existingImportantFieldIds.every(id => importantFieldIds.includes(id));
                if (areFieldIdsIdentitical) {
                    return [];
                }

                return [updateMetricImportantFields(metricFormField.id, importantFieldIds)];
            });

        const segmentFields = formFields.important_segments_and_tables
            .filter(field => field.type === 'segment');

        const updatingSegments = updateNewEntities({
                entities: segments,
                formFields: segmentFields,
                updateEntity: updateWithRevisionMessage(updateSegment)
            })
            .concat(updateOldEntities({
                newEntityIds: segmentFields
                    .map(formField => formField.id),
                oldEntityIds: guide.important_segments,
                entities: segments,
                updateEntity: updateWithRevisionMessage(updateSegment)
            }));

        const tableFields = formFields.important_segments_and_tables
            .filter(field => field.type === 'table');

        const updatingTables = updateNewEntities({
                entities: tables,
                formFields: tableFields,
                updateEntity: updateTable
            })
            .concat(updateOldEntities({
                newEntityIds: tableFields
                    .map(formField => formField.id),
                oldEntityIds: guide.important_tables,
                entities: tables,
                updateEntity: updateTable
            }));

        const updatingThingsToKnow = guide.things_to_know !== formFields.things_to_know ?
            [updateSetting({key: 'getting-started-things-to-know', value: formFields.things_to_know })] :
            [];

        const updatingContactName = guide.contact && formFields.contact &&
            guide.contact.name !== formFields.contact.name ?
                [updateSetting({key: 'getting-started-contact-name', value: formFields.contact.name })] :
                [];

        const updatingContactEmail = guide.contact && formFields.contact &&
            guide.contact.email !== formFields.contact.email ?
                [updateSetting({key: 'getting-started-contact-email', value: formFields.contact.email })] :
                [];

        const updatingData = _.flatten([
            updatingDashboards,
            updatingMetrics,
            updatingMetricImportantFields,
            updatingSegments,
            updatingTables,
            updatingThingsToKnow,
            updatingContactName,
            updatingContactEmail
        ]);

        if (updatingData.length > 0) {
            await Promise.all(updatingData);

            clearRequestState({statePath: ['reference', 'guide']});

            await fetchGuide();
        }
    }
    catch(error) {
        setError(error);
        console.error(error);
    }

    resetForm();
    endLoading();
    endEditing();
};

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

export const buildBreadcrumbs = (section) => getParentSections(section)
    .map(getBreadcrumb)
    .slice(-3);

export const databaseToForeignKeys = (database) => database && database.tables_lookup ?
    Object.values(database.tables_lookup)
        // ignore tables without primary key
        .filter(table => table && table.fields.find(field => isPK(field.special_type)))
        .map(table => ({
            table: table,
            field: table && table.fields
                .find(field => isPK(field.special_type))
        }))
        .map(({ table, field }) => ({
            id: field.id,
            name: table.schema && table.schema !== "public" ?
                `${titleize(humanize(table.schema))}.${table.display_name} → ${field.display_name}` :
                `${table.display_name} → ${field.display_name}`,
            description: field.description
        }))
        .reduce((map, foreignKey) => assoc(map, foreignKey.id, foreignKey), {}) :
    {};

export const fieldsToFormFields = (fields) => Object.keys(fields)
    .map(key => [
        `${key}.display_name`,
        `${key}.special_type`,
        `${key}.fk_target_field_id`
    ])
    .reduce((array, keys) => array.concat(keys), []);

export const separateTablesBySchema = (
    tables,
    section,
    createSchemaSeparator,
    createListItem
) => Object.values(tables)
    .sort((table1, table2) => table1.schema > table2.schema ? 1 :
        table1.schema === table2.schema ? 0 : -1
    )
    .map((table, index, sortedTables) => {
        if (!table || !table.id || !table.name) {
            return;
        }
        // add schema header for first element and if schema is different from previous
        const previousTableId = Object.keys(sortedTables)[index - 1];
        return index === 0 ||
            sortedTables[previousTableId].schema !== table.schema ?
                [
                    createSchemaSeparator(table),
                    createListItem(table, index, section)
                ] :
                createListItem(table, index, section);
    });

export const getQuestion = ({dbId, tableId, fieldId, metricId, segmentId, getCount, visualization}) => {
    const newQuestion = startNewCard('query', dbId, tableId);

    // consider taking a look at Ramda as a possible underscore alternative?
    // http://ramdajs.com/0.21.0/index.html
    const question = chain(newQuestion)
        .updateIn(
            ['dataset_query', 'query', 'aggregation'],
            aggregation => getCount ? ['count'] : aggregation
        )
        .updateIn(['display'], display => visualization || display)
        .updateIn(
            ['dataset_query', 'query', 'breakout'],
            breakout => fieldId ? [fieldId] : breakout
        )
        .value();

    if (metricId) {
        return assocIn(question, ['dataset_query', 'query', 'aggregation'], ['METRIC', metricId]);
    }

    if (segmentId) {
        return assocIn(question, ['dataset_query', 'query', 'filter'], ['AND', ['SEGMENT', segmentId]]);
    }

    return question;
};

export const getQuestionUrl = getQuestionArgs => Urls.question(null, getQuestion(getQuestionArgs));

export const isGuideEmpty = ({
    things_to_know,
    contact,
    most_important_dashboard,
    important_metrics,
    important_segments,
    important_tables
} = {}) => things_to_know ? false :
    contact && contact.name ? false :
    contact && contact.email ? false :
    most_important_dashboard ? false :
    important_metrics && important_metrics.length !== 0 ? false :
    important_segments && important_segments.length !== 0 ? false :
    important_tables && important_tables.length !== 0 ? false :
    true;

export const typeToLinkClass = {
    dashboard: 'text-green',
    metric: 'text-brand',
    segment: 'text-purple',
    table: 'text-purple'
};

export const typeToBgClass = {
    dashboard: 'bg-green',
    metric: 'bg-brand',
    segment: 'bg-purple',
    table: 'bg-purple'
};

// little utility function to determine if we 'has' things, useful
// for handling entity empty states
export const has = (entity) => entity && entity.length > 0;
