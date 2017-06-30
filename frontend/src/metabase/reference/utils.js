import { assoc, assocIn, chain } from "icepick";

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

export const filterUntouchedFields = (fields, entity = {}) => Object.keys(fields)
    .filter(key =>
        fields[key] !== undefined &&
        entity[key] !== fields[key]
    )
    .reduce((map, key) => ({ ...map, [key]: fields[key] }), {});

export const isEmptyObject = (object) => Object.keys(object).length === 0;


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
        section,
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

export const tryUpdateMetric = async (fields, props) => {
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
