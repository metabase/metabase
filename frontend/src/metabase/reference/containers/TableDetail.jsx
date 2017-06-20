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
import UsefulQuestions from "metabase/reference/components/UsefulQuestions.jsx";

import {
    tryUpdateData
} from '../utils';

import {
    getSection,
    getData,
    getTable,
    getFields,
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

// const section = {
//         id: `/reference/databases/${database.id}/tables/${table.id}`,
//         name: 'Details',
//         update: 'updateTable',
//         type: 'table',
//         questions: [
//             {
//                 text: `Count of ${table.display_name}`,
//                 icon: { name: "number", scale: 1, viewBox: "8 8 16 16" },
//                 link: getQuestionUrl({
//                     dbId: table.db_id,
//                     tableId: table.id,
//                     getCount: true
//                 })
//             },
//             {
//                 text: `See raw data for ${table.display_name}`,
//                 icon: "table2",
//                 link: getQuestionUrl({
//                     dbId: table.db_id,
//                     tableId: table.id,
//                 })
//             }
//         ],
//         breadcrumb: `${table.display_name}`,
//         fetch: {
//             fetchDatabaseMetadata: [database.id]
//         },
//         get: 'getTable',
//         icon: "document",
//         headerIcon: "table2",
//         headerLink: getQuestionUrl({
//             dbId: table.db_id,
//             tableId: table.id,
//         }),
//         parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
//     }

const mapStateToProps = (state, props) => {
    const entity = getData(state, props) || {};
    const fields = getFields(state, props);

    return {
        section: getSection(state, props),
        entity,
        table: getTable(state, props),
        metadataFields: fields,
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
    fields: ['name', 'display_name', 'description', 'revision_message', 'points_of_interest', 'caveats'],
    validate
})
export default class TableDetail extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entity: PropTypes.object.isRequired,
        table: PropTypes.object,
        user: PropTypes.object.isRequired,
        isEditing: PropTypes.bool,
        startEditing: PropTypes.func.isRequired,
        endEditing: PropTypes.func.isRequired,
        startLoading: PropTypes.func.isRequired,
        endLoading: PropTypes.func.isRequired,
        setError: PropTypes.func.isRequired,
        updateField: PropTypes.func.isRequired,
        handleSubmit: PropTypes.func.isRequired,
        resetForm: PropTypes.func.isRequired,
        fields: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        hasSingleSchema: PropTypes.bool,
        hasDisplayName: PropTypes.bool,
        hasRevisionHistory: PropTypes.bool,
        loading: PropTypes.bool,
        loadingError: PropTypes.object,
        submitting: PropTypes.bool,
    };

    render() {
        const {
            fields: { name, display_name, description, revision_message, points_of_interest, caveats },
            style,
            section,
            entity,
            table,
            loadingError,
            loading,
            user,
            isEditing,
            startEditing,
            endEditing,
            hasSingleSchema,
            hasDisplayName,
            hasRevisionHistory,
            handleSubmit,
            resetForm,
            submitting,
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
                            { !isEditing &&
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
                            { !isEditing &&
                                <li className="relative">
                                    <UsefulQuestions questions={section.questions} />
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
