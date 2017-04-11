/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import { push } from "react-router-redux";

import S from "metabase/reference/Reference.css";

import List from "metabase/components/List.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import ReferenceHeader from "metabase/reference/components/ReferenceHeader.jsx";
import Detail from "metabase/reference/components/Detail.jsx";
import FieldTypeDetail from "metabase/reference/components/FieldTypeDetail.jsx";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions.jsx";
import FieldsToGroupBy from "metabase/reference/components/FieldsToGroupBy.jsx";
import Formula from "metabase/reference/components/Formula.jsx";
import MetricImportantFieldsDetail from "metabase/reference/components/MetricImportantFieldsDetail.jsx";

import {
    tryUpdateData
} from '../utils';

import {
    getSection,
    getData,
    getTable,
    getFields,
    getGuide,
    getError,
    getLoading,
    getUser,
    getHasQuestions,
    getIsEditing,
    getHasDisplayName,
    getHasRevisionHistory,
    getHasSingleSchema,
    getIsFormulaExpanded,
    getForeignKeys
} from "../selectors";

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

const mapStateToProps = (state, props) => {
    const entity = getData(state, props) || {};
    const guide = getGuide(state, props);
    const fields = getFields(state, props);

    const initialValues = {
        important_fields: guide && guide.metric_important_fields &&
            guide.metric_important_fields[entity.id] &&
            guide.metric_important_fields[entity.id]
                .map(fieldId => fields[fieldId]) ||
                []
    };

    return {
        section: getSection(state, props),
        entity,
        table: getTable(state, props),
        metadataFields: fields,
        guide,
        loading: getLoading(state, props),
        // naming this 'error' will conflict with redux form
        loadingError: getError(state, props),
        user: getUser(state, props),
        foreignKeys: getForeignKeys(state, props),
        isEditing: getIsEditing(state, props),
        hasSingleSchema: getHasSingleSchema(state, props),
        hasQuestions: getHasQuestions(state, props),
        hasDisplayName: getHasDisplayName(state, props),
        isFormulaExpanded: getIsFormulaExpanded(state, props),
        hasRevisionHistory: getHasRevisionHistory(state, props),
        initialValues,
    }
};

const mapDispatchToProps = {
    ...metadataActions,
    ...actions,
    onChangeLocation: push
};

const validate = (values, props) => props.hasRevisionHistory ?
    !values.revision_message ?
        { revision_message: "Please enter a revision message" } : {} :
    {};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'details',
    fields: ['name', 'display_name', 'description', 'revision_message', 'points_of_interest', 'caveats', 'how_is_this_calculated', 'special_type', 'fk_target_field_id', 'important_fields'],
    validate
})
export default class ReferenceEntity extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entity: PropTypes.object.isRequired,
        table: PropTypes.object,
        metadataFields: PropTypes.object,
        guide: PropTypes.object,
        user: PropTypes.object.isRequired,
        foreignKeys: PropTypes.object,
        isEditing: PropTypes.bool,
        hasQuestions: PropTypes.bool,
        startEditing: PropTypes.func.isRequired,
        endEditing: PropTypes.func.isRequired,
        startLoading: PropTypes.func.isRequired,
        endLoading: PropTypes.func.isRequired,
        expandFormula: PropTypes.func.isRequired,
        collapseFormula: PropTypes.func.isRequired,
        setError: PropTypes.func.isRequired,
        updateField: PropTypes.func.isRequired,
        handleSubmit: PropTypes.func.isRequired,
        resetForm: PropTypes.func.isRequired,
        fields: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        hasSingleSchema: PropTypes.bool,
        hasDisplayName: PropTypes.bool,
        isFormulaExpanded: PropTypes.bool,
        hasRevisionHistory: PropTypes.bool,
        loading: PropTypes.bool,
        loadingError: PropTypes.object,
        submitting: PropTypes.bool,
        onChangeLocation: PropTypes.func.isRequired
    };

    render() {
        const {
            fields: { name, display_name, description, revision_message, points_of_interest, caveats, how_is_this_calculated, special_type, fk_target_field_id, important_fields },
            style,
            section,
            entity,
            table,
            metadataFields,
            guide,
            loadingError,
            loading,
            user,
            foreignKeys,
            isEditing,
            hasQuestions,
            startEditing,
            endEditing,
            expandFormula,
            collapseFormula,
            hasSingleSchema,
            hasDisplayName,
            isFormulaExpanded,
            hasRevisionHistory,
            handleSubmit,
            resetForm,
            submitting,
            onChangeLocation
        } = this.props;

        const onSubmit = handleSubmit(async (fields) =>
            await tryUpdateData(fields, this.props)
        );

        return (
            <form style={style} className="full"
                onSubmit={onSubmit}
            >
                { isEditing &&
                    <EditHeader
                        hasRevisionHistory={hasRevisionHistory}
                        onSubmit={onSubmit}
                        endEditing={endEditing}
                        reinitializeForm={resetForm}
                        submitting={submitting}
                        revisionMessageFormField={revision_message}
                    />
                }
                <ReferenceHeader
                    entity={entity}
                    table={table}
                    section={section}
                    user={user}
                    isEditing={isEditing}
                    hasSingleSchema={hasSingleSchema}
                    hasDisplayName={hasDisplayName}
                    startEditing={startEditing}
                    displayNameFormField={display_name}
                    nameFormField={name}
                />
                <LoadingAndErrorWrapper loading={!loadingError && loading} error={loadingError}>
                { () =>
                    <div className="wrapper wrapper--trim">
                        <List>
                            <li className="relative">
                                <Detail
                                    id="description"
                                    name="Description"
                                    description={entity.description}
                                    placeholder="No description yet"
                                    isEditing={isEditing}
                                    field={description}
                                />
                            </li>
                            { hasDisplayName && !isEditing &&
                                <li className="relative">
                                    <Detail
                                        id="name"
                                        name="Actual name in database"
                                        description={entity.name}
                                        subtitleClass={S.tableActualName}
                                    />
                                </li>
                            }
                            <li className="relative">
                                <Detail
                                    id="points_of_interest"
                                    name={`Why this ${section.type} is interesting`}
                                    description={entity.points_of_interest}
                                    placeholder="Nothing interesting yet"
                                    isEditing={isEditing}
                                    field={points_of_interest}
                                    />
                            </li>
                            <li className="relative">
                                <Detail
                                    id="caveats"
                                    name={`Things to be aware of about this ${section.type}`}
                                    description={entity.caveats}
                                    placeholder="Nothing to be aware of yet"
                                    isEditing={isEditing}
                                    field={caveats}
                                />
                            </li>
                            { section.type === 'metric' &&
                                <li className="relative">
                                    <Detail
                                        id="how_is_this_calculated"
                                        name={`How this ${section.type} is calculated`}
                                        description={entity.how_is_this_calculated}
                                        placeholder="Nothing on how it's calculated yet"
                                        isEditing={isEditing}
                                        field={how_is_this_calculated}
                                    />
                                </li>
                            }
                            { (section.type === 'metric' || section.type === 'segment') &&
                                table && !isEditing &&
                                <li className="relative">
                                    <Formula
                                        type={section.type}
                                        entity={entity}
                                        table={table}
                                        isExpanded={isFormulaExpanded}
                                        expandFormula={expandFormula}
                                        collapseFormula={collapseFormula}
                                    />
                                </li>
                            }
                            { !isEditing && section.type === 'field' &&
                                <li className="relative">
                                    <Detail
                                        id="base_type"
                                        name={`Data type`}
                                        description={entity.base_type}
                                    />
                                </li>
                            }
                            { section.type === 'field' &&
                                <li className="relative">
                                    <FieldTypeDetail
                                        field={entity}
                                        foreignKeys={foreignKeys}
                                        fieldTypeFormField={special_type}
                                        foreignKeyFormField={fk_target_field_id}
                                        isEditing={isEditing}
                                    />
                                </li>
                            }
                            { hasQuestions && !isEditing &&
                                <li className="relative">
                                    <UsefulQuestions questions={section.questions} />
                                </li>
                            }
                            { section.type === 'metric' &&
                                <li className="relative">
                                    <MetricImportantFieldsDetail
                                        fields={guide && guide.metric_important_fields[entity.id] &&
                                            Object.values(guide.metric_important_fields[entity.id])
                                                .map(fieldId => metadataFields[fieldId])
                                                .reduce((map, field) => ({ ...map, [field.id]: field }), {})
                                        }
                                        table={table}
                                        allFields={metadataFields}
                                        metric={entity}
                                        onChangeLocation={onChangeLocation}
                                        isEditing={isEditing}
                                        formField={important_fields}
                                    />
                                </li>
                            }
                            { section.type === 'metric' && !isEditing &&
                                <li className="relative">
                                    <FieldsToGroupBy
                                        fields={table.fields
                                            .filter(fieldId => !guide || !guide.metric_important_fields[entity.id] ||
                                                !guide.metric_important_fields[entity.id].includes(fieldId)
                                            )
                                            .map(fieldId => metadataFields[fieldId])
                                            .reduce((map, field) => ({ ...map, [field.id]: field }), {})
                                        }
                                        databaseId={table.db_id}
                                        metric={entity}
                                        title={ guide && guide.metric_important_fields[entity.id] ?
                                            "Other fields you can group this metric by" :
                                            "Fields you can group this metric by"
                                        }
                                        onChangeLocation={onChangeLocation}
                                    />
                                </li>
                            }
                        </List>
                    </div>
                }
                </LoadingAndErrorWrapper>
            </form>
        )
    }
}
