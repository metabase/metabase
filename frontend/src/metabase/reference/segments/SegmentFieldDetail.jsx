/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import { t } from "ttag";
import S from "metabase/reference/Reference.css";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Detail from "metabase/reference/components/Detail";
import FieldTypeDetail from "metabase/reference/components/FieldTypeDetail";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";

import { getQuestionUrl } from "../utils";

import {
  getFieldBySegment,
  getTable,
  getFields,
  getGuide,
  getError,
  getLoading,
  getUser,
  getIsEditing,
  getForeignKeys,
  getIsFormulaExpanded,
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

const interestingQuestions = (table, field) => {
  return [
    {
      text: t`Number of ${table && table.display_name} grouped by ${
        field.display_name
      }`,
      icon: "number",
      link: getQuestionUrl({
        dbId: table && table.db_id,
        tableId: table.id,
        fieldId: field.id,
        getCount: true,
      }),
    },
    {
      text: t`All distinct values of ${field.display_name}`,
      icon: "table2",
      link: getQuestionUrl({
        dbId: table && table.db_id,
        tableId: table.id,
        fieldId: field.id,
      }),
    },
  ];
};

const mapStateToProps = (state, props) => {
  const entity = getFieldBySegment(state, props) || {};
  const guide = getGuide(state, props);
  const fields = getFields(state, props);

  const initialValues = {
    important_fields:
      (guide &&
        guide.metric_important_fields &&
        guide.metric_important_fields[entity.id] &&
        guide.metric_important_fields[entity.id].map(
          fieldId => fields[fieldId],
        )) ||
      [],
  };

  return {
    entity,
    table: getTable(state, props),
    guide,
    loading: getLoading(state, props),
    // naming this 'error' will conflict with redux form
    loadingError: getError(state, props),
    user: getUser(state, props),
    foreignKeys: getForeignKeys(state, props),
    isEditing: getIsEditing(state, props),
    isFormulaExpanded: getIsFormulaExpanded(state, props),
    initialValues,
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

const validate = (values, props) => {
  return {};
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@reduxForm({
  form: "details",
  fields: [
    "name",
    "display_name",
    "description",
    "revision_message",
    "points_of_interest",
    "caveats",
    "special_type",
    "fk_target_field_id",
  ],
  validate,
})
export default class SegmentFieldDetail extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    entity: PropTypes.object.isRequired,
    table: PropTypes.object,
    user: PropTypes.object.isRequired,
    foreignKeys: PropTypes.object,
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
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
    submitting: PropTypes.bool,
  };

  render() {
    const {
      fields: {
        name,
        display_name,
        description,
        revision_message,
        points_of_interest,
        caveats,
        special_type,
        fk_target_field_id,
      },
      style,
      entity,
      table,
      loadingError,
      loading,
      user,
      foreignKeys,
      isEditing,
      startEditing,
      endEditing,
      handleSubmit,
      resetForm,
      submitting,
    } = this.props;

    const onSubmit = handleSubmit(
      async fields =>
        await actions.rUpdateSegmentFieldDetail(fields, this.props),
    );

    return (
      <form style={style} className="full" onSubmit={onSubmit}>
        {isEditing && (
          <EditHeader
            hasRevisionHistory={false}
            onSubmit={onSubmit}
            endEditing={endEditing}
            reinitializeForm={resetForm}
            submitting={submitting}
            revisionMessageFormField={revision_message}
          />
        )}
        <EditableReferenceHeader
          entity={entity}
          table={table}
          headerIcon="field"
          name={t`Details`}
          type="field"
          user={user}
          isEditing={isEditing}
          hasSingleSchema={false}
          hasDisplayName={true}
          startEditing={startEditing}
          displayNameFormField={display_name}
          nameFormField={name}
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() => (
            <div className="wrapper">
              <div className="pl3 py2 mb4 bg-white bordered">
                <List>
                  <li className="relative">
                    <Detail
                      id="description"
                      name={t`Description`}
                      description={entity.description}
                      placeholder={t`No description yet`}
                      isEditing={isEditing}
                      field={description}
                    />
                  </li>
                  {!isEditing && (
                    <li className="relative">
                      <Detail
                        id="name"
                        name={t`Actual name in database`}
                        description={entity.name}
                        subtitleClass={S.tableActualName}
                      />
                    </li>
                  )}
                  <li className="relative">
                    <Detail
                      id="points_of_interest"
                      name={t`Why this field is interesting`}
                      description={entity.points_of_interest}
                      placeholder={t`Nothing interesting yet`}
                      isEditing={isEditing}
                      field={points_of_interest}
                    />
                  </li>
                  <li className="relative">
                    <Detail
                      id="caveats"
                      name={t`Things to be aware of about this field`}
                      description={entity.caveats}
                      placeholder={t`Nothing to be aware of yet`}
                      isEditing={isEditing}
                      field={caveats}
                    />
                  </li>

                  {!isEditing && (
                    <li className="relative">
                      <Detail
                        id="base_type"
                        name={t`Data type`}
                        description={entity.base_type}
                      />
                    </li>
                  )}
                  <li className="relative">
                    <FieldTypeDetail
                      field={entity}
                      foreignKeys={foreignKeys}
                      fieldTypeFormField={special_type}
                      foreignKeyFormField={fk_target_field_id}
                      isEditing={isEditing}
                    />
                  </li>
                  {!isEditing && (
                    <li className="relative">
                      <UsefulQuestions
                        questions={interestingQuestions(
                          this.props.table,
                          this.props.entity,
                        )}
                      />
                    </li>
                  )}
                </List>
              </div>
            </div>
          )}
        </LoadingAndErrorWrapper>
      </form>
    );
  }
}
