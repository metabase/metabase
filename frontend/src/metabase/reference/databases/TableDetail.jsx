/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import { push } from "react-router-redux";
import { t } from "ttag";
import S from "metabase/reference/Reference.css";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Detail from "metabase/reference/components/Detail";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";

import { getQuestionUrl } from "../utils";

import {
  getTable,
  getFields,
  getError,
  getLoading,
  getUser,
  getIsEditing,
  getHasSingleSchema,
  getIsFormulaExpanded,
  getForeignKeys,
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

const interestingQuestions = table => {
  return [
    {
      text: t`Count of ${table.display_name}`,
      icon: "number",
      link: getQuestionUrl({
        dbId: table.db_id,
        tableId: table.id,
        getCount: true,
      }),
    },
    {
      text: t`See raw data for ${table.display_name}`,
      icon: "table2",
      link: getQuestionUrl({
        dbId: table.db_id,
        tableId: table.id,
      }),
    },
  ];
};
const mapStateToProps = (state, props) => {
  const entity = getTable(state, props) || {};
  const fields = getFields(state, props);

  return {
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
    isFormulaExpanded: getIsFormulaExpanded(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onChangeLocation: push,
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
  ],
  validate,
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
    hasSingleSchema: PropTypes.bool,
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
      },
      style,
      entity,
      table,
      loadingError,
      loading,
      user,
      isEditing,
      startEditing,
      endEditing,
      hasSingleSchema,
      handleSubmit,
      resetForm,
      submitting,
    } = this.props;

    const onSubmit = handleSubmit(
      async fields => await actions.rUpdateTableDetail(fields, this.props),
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
          type="table"
          headerIcon="table2"
          headerLink={getQuestionUrl({
            dbId: entity.db_id,
            tableId: entity.id,
          })}
          name={t`Details`}
          user={user}
          isEditing={isEditing}
          hasSingleSchema={hasSingleSchema}
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
              <div className="pl4 pr3 pt4 mb4 mb1 bg-white rounded bordered">
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
                      name={t`Why this table is interesting`}
                      description={entity.points_of_interest}
                      placeholder={t`Nothing interesting yet`}
                      isEditing={isEditing}
                      field={points_of_interest}
                    />
                  </li>
                  <li className="relative">
                    <Detail
                      id="caveats"
                      name={t`Things to be aware of about this table`}
                      description={entity.caveats}
                      placeholder={t`Nothing to be aware of yet`}
                      isEditing={isEditing}
                      field={caveats}
                    />
                  </li>
                  {!isEditing && (
                    <li className="relative">
                      <UsefulQuestions
                        questions={interestingQuestions(this.props.table)}
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
