/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";

import S from "metabase/components/List.css";
import D from "metabase/components/Detail.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List.jsx";
import Detail from "metabase/components/Detail.jsx";
import Icon from "metabase/components/Icon.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import QueryButton from "metabase/query_builder/dataref/QueryButton.jsx";
import FieldTypeDetail from "metabase/reference/components/FieldTypeDetail.jsx";
import RevisionMessageModal from "metabase/reference/components/RevisionMessageModal.jsx";
import Formula from "metabase/reference/components/Formula.jsx";

import cx from "classnames";

import {
    tryUpdateData,
    getQuestionUrl
} from '../utils';

import {
    getSection,
    getData,
    getTableByMetric,
    getTableBySegment,
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
    const section = getSection(state);
    // a bit hacky
    // will have to do until we refactor to use 1 container per section type
    const table = section.type === 'metric' ?
        getTableByMetric(state) :
        section.type === 'segment' ?
            getTableBySegment(state) :
            {};

    return {
        section,
        entity: getData(state) || {},
        table,
        loading: getLoading(state),
        // naming this 'error' will conflict with redux form
        loadingError: getError(state),
        user: getUser(state),
        foreignKeys: getForeignKeys(state),
        isEditing: getIsEditing(state),
        hasSingleSchema: getHasSingleSchema(state),
        hasQuestions: getHasQuestions(state),
        hasDisplayName: getHasDisplayName(state),
        isFormulaExpanded: getIsFormulaExpanded(state),
        hasRevisionHistory: getHasRevisionHistory(state)
    };
};

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

const validate = (values, props) => props.hasRevisionHistory ?
    !values.revision_message ?
        { revision_message: "Please enter a revision message" } : {} :
    {};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'details',
    fields: ['name', 'display_name', 'description', 'revision_message', 'points_of_interest', 'caveats', 'how_is_this_calculated', 'special_type', 'fk_target_field_id'],
    validate
})
export default class ReferenceEntity extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entity: PropTypes.object.isRequired,
        table: PropTypes.object,
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
        onChangeLocation: PropTypes.func
    };

    render() {
        const {
            fields: { name, display_name, description, revision_message, points_of_interest, caveats, how_is_this_calculated, special_type, fk_target_field_id },
            style,
            section,
            entity,
            table,
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
                    <div className={cx("EditHeader wrapper py1", R.editHeader)}>
                        <div>
                            You are editing this page
                        </div>
                        <div className={R.editHeaderButtons}>
                            { hasRevisionHistory ?
                                <RevisionMessageModal
                                    action={() => onSubmit()}
                                    field={revision_message}
                                    submitting={submitting}
                                >
                                    <button
                                        className={cx("Button", "Button--primary", "Button--white", "Button--small", R.saveButton)}
                                        type="button"
                                        disabled={submitting}
                                    >
                                        SAVE
                                    </button>
                                </RevisionMessageModal> :
                                <button
                                    className={cx("Button", "Button--primary", "Button--white", "Button--small", R.saveButton)}
                                    type="submit"
                                    disabled={submitting}
                                >
                                    SAVE
                                </button>
                            }

                            <button
                                type="button"
                                className={cx("Button", "Button--white", "Button--small", R.cancelButton)}
                                onClick={endEditing}
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                }
                { /* NOTE: this doesn't currently use ReferenceHeader since it is much more complicated */ }
                <div className="wrapper wrapper--trim">
                    <div className={cx("relative", S.header)} style={section.type === 'segment' ? {marginBottom: 0} : {}}>
                        <div className={S.leftIcons}>
                            { section.headerIcon &&
                                <IconBorder borderWidth="0" style={{backgroundColor: "#E9F4F8"}}>
                                    <Icon
                                        className="text-brand"
                                        name={section.headerIcon}
                                        width={24}
                                        height={24}
                                    />
                                </IconBorder>
                            }
                        </div>
                        { section.type === 'table' && !hasSingleSchema && !isEditing &&
                            <div className={R.headerSchema}>{entity.schema}</div>
                        }
                        <div className={R.headerBody} style={isEditing ? {alignItems: "flex-start"} : {}}>
                            { isEditing ?
                                hasDisplayName ?
                                    <input
                                        className={R.headerTextInput}
                                        type="text"
                                        placeholder={entity.name}
                                        {...display_name}
                                        defaultValue={entity.display_name}
                                    /> :
                                    <input
                                        className={R.headerTextInput}
                                        type="text"
                                        placeholder={entity.name}
                                        {...name}
                                        defaultValue={entity.name}
                                    /> :
                                [
                                    <Ellipsified key="1" className={!section.headerLink && "flex-full"} tooltipMaxWidth="100%">
                                        { hasDisplayName ?
                                            entity.display_name || entity.name :
                                            entity.name
                                        }
                                    </Ellipsified>,
                                    section.headerLink &&
                                        <div key="2" className={cx("flex-full", S.headerButton)}>
                                            <Link
                                                to={section.headerLink}
                                                className={cx("Button", "Button--borderless", R.editButton)}
                                                data-metabase-event={`Data Reference;Entity -> QB click;${section.type}`}
                                            >
                                                <div className="flex align-center relative">
                                                    <span className="mr1">See this {section.type}</span>
                                                    <Icon name="chevronright" size={16} />
                                                </div>
                                            </Link>
                                        </div>
                                ]
                            }
                            { user.is_superuser && !isEditing &&
                                <div className={S.headerButton}>
                                    <a
                                        onClick={startEditing}
                                        className={cx("Button", "Button--borderless", R.editButton)}
                                    >
                                        <div className="flex align-center relative">
                                            <Icon name="pencil" size={16} />
                                            <span className="ml1">Edit</span>
                                        </div>
                                    </a>
                                </div>
                            }
                        </div>
                    </div>
                    { section.type === 'segment' && table &&
                        <div className={R.subheader}>
                            <div className={cx(R.subheaderBody)}>
                                A subset of <Link className={R.subheaderLink} to={`/reference/databases/${table.db_id}/tables/${table.id}`}>{table.display_name}</Link>
                            </div>
                        </div>
                    }
                </div>
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
                                        subtitleClass={R.tableActualName}
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
                                table &&
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
                                    <div className={cx(D.detail)}>
                                        <div className={D.detailBody}>
                                            <div className={D.detailTitle}>
                                                <span className={D.detailName}>Potentially useful questions</span>
                                            </div>
                                            <div className={R.usefulQuestions}>
                                                { section.questions.map((question, index, questions) =>
                                                    <QueryButton
                                                        key={index}
                                                        className={cx("border-bottom", "pt1", "pb1")}
                                                        iconClass={S.icon}
                                                        {...question}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            }
                            { section.type === 'metric' && !isEditing &&
                                <li className="relative">
                                    <div className={cx(D.detail)}>
                                        <div className={D.detailBody}>
                                            <div className={D.detailTitle}>
                                                <span className={D.detailName}>Fields you can group this metric by</span>
                                            </div>
                                            <div className={R.usefulQuestions}>
                                                { table && table.fields_lookup && Object.values(table.fields_lookup)
                                                    .map((field, index, fields) =>
                                                        <QueryButton
                                                            key={field.id}
                                                            className={cx("border-bottom", "pt1", "pb1")}
                                                            iconClass={S.icon}
                                                            text={field.display_name}
                                                            icon="reference"
                                                            onClick={() => onChangeLocation(`/reference/databases/${table.db_id}/tables/${table.id}/fields/${field.id}`)}
                                                            secondaryText={`see ${entity.name} by ${field.display_name}`}
                                                            secondaryOnClick={(event) => {
                                                                event.stopPropagation();
                                                                onChangeLocation(getQuestionUrl({
                                                                    dbId: table.db_id,
                                                                    tableId: table.id,
                                                                    fieldId: field.id,
                                                                    metricId: entity.id
                                                                }))
                                                            }}
                                                        />
                                                    )
                                                }
                                            </div>
                                        </div>
                                    </div>
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
