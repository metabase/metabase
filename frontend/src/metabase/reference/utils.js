import i from "icepick";

import { startNewCard, serializeCardForUrl } from "metabase/lib/card";

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

    const editedFields = Object.keys(fields)
        .filter(key => fields[key] !== undefined)
        .reduce((map, key) => i.assoc(map, key, fields[key]), {});
    const newEntity = {...entity, ...editedFields};
    startLoading();
    try {
        await props[section.update](newEntity);
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
        setError
    } = props;

    const updatedFields = Object.keys(formFields)
        .map(fieldId => ({
            field: entities[fieldId],
            formField: Object.keys(formFields[fieldId])
                .filter(key => formFields[fieldId][key] !== undefined)
                .reduce((map, key) => i
                    .assoc(map, key, formFields[fieldId][key]), {}
                )
        }))
        .filter(({field, formField}) => Object
            .keys(formField).length !== 0
        )
        .map(({field, formField}) => ({...field, ...formField}));

    startLoading();
    try {
        await Promise.all(updatedFields.map(updateField));
    }
    catch(error) {
        setError(error);
        console.error(error);
    }
    endLoading();
    endEditing();
}

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

const getQuestion = ({dbId, tableId, fieldId, metricId, segmentId, getCount, visualization}) => {
    const newQuestion = startNewCard('query', dbId, tableId);

    // consider taking a look at Ramda as a possible underscore alternative?
    // http://ramdajs.com/0.21.0/index.html
    const question = i.chain(newQuestion)
        .updateIn(
            ['dataset_query', 'query', 'aggregation'],
            aggregation => getCount ? ['count'] : aggregation
        )
        .updateIn(['display'], display => visualization || display)
        .value();

    if (fieldId) {
        return i.assocIn(question, ['dataset_query', 'query', 'breakout'], [fieldId]);
    }

    if (segmentId) {
        return i.assocIn(question, ['dataset_query', 'query', 'filter'], ['AND', ['SEGMENT', segmentId]]);
    }

    return question;
};

export const getQuestionUrl = getQuestionArgs => `/q#${serializeCardForUrl(getQuestion(getQuestionArgs))}`;
