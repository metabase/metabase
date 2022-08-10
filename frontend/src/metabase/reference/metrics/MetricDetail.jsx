/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { useFormik } from "formik";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Detail from "metabase/reference/components/Detail";
import FieldsToGroupBy from "metabase/reference/components/FieldsToGroupBy";
import Formula from "metabase/reference/components/Formula";

import { getQuestionUrl } from "../utils";

import {
  getError,
  getFields,
  getForeignKeys,
  getIsFormulaExpanded,
  getLoading,
  getMetric,
  getTable,
  getUser,
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

const mapStateToProps = (state, props) => {
  const entity = getMetric(state, props) || {};
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
    isFormulaExpanded: getIsFormulaExpanded(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,

  // Metric page doesn't use Redux isEditing state and related callbacks
  // The state and callbacks are received via props
  ..._.omit(actions, "startEditing", "endEditing"),

  onChangeLocation: push,
};

const validate = values =>
  !values.revision_message
    ? { revision_message: t`Please enter a revision message` }
    : {};

const propTypes = {
  style: PropTypes.object.isRequired,
  entity: PropTypes.object.isRequired,
  table: PropTypes.object,
  metadataFields: PropTypes.object,
  user: PropTypes.object.isRequired,
  isEditing: PropTypes.bool,
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
  isFormulaExpanded: PropTypes.bool,
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  submitting: PropTypes.bool,
  onChangeLocation: PropTypes.func.isRequired,
};

const MetricDetail = props => {
  const {
    fields: { revision_message },
    style,
    entity,
    table,
    metadataFields,
    loadingError,
    loading,
    user,
    isEditing,
    startEditing,
    endEditing,
    expandFormula,
    collapseFormula,
    isFormulaExpanded,
    handleSubmit: onSubmit,
    resetForm,
    submitting,
    onChangeLocation,
  } = props;

  const handleUpdate = onSubmit(fields =>
    actions.rUpdateMetricDetail(props.entity, fields, props),
  );

  const { getFieldProps, getFieldMeta, handleSubmit } = useFormik({
    validate,
    onSubmit: handleUpdate,
  });

  const getField = name => ({ ...getFieldProps(name), ...getFieldMeta(name) });

  return (
    <form style={style} className="full" onSubmit={handleSubmit}>
      {isEditing && (
        <EditHeader
          hasRevisionHistory={true}
          onSubmit={handleSubmit}
          endEditing={endEditing}
          reinitializeForm={resetForm}
          submitting={submitting}
          revisionMessageFormField={revision_message}
        />
      )}
      <EditableReferenceHeader
        entity={entity}
        table={table}
        type="metric"
        headerIcon="ruler"
        headerLink={getQuestionUrl({
          dbId: table && table.db_id,
          tableId: entity.table_id,
          metricId: entity.id,
        })}
        name={t`Details`}
        user={user}
        isEditing={isEditing}
        hasSingleSchema={false}
        hasDisplayName={false}
        startEditing={startEditing}
        displayNameFormField={getField("display_name")}
        nameFormField={getField("name")}
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
                    field={getField("description")}
                    title={t`Description`}
                    description={entity.description}
                    placeholder={t`No description yet`}
                    isEditing={isEditing}
                  />
                </li>
                <li className="relative">
                  <Detail
                    field={getField("points_of_interest")}
                    title={t`Why this metric is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                  />
                </li>
                <li className="relative">
                  <Detail
                    field={getField("caveats")}
                    title={t`Things to be aware of about this metric`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                  />
                </li>
                <li className="relative">
                  <Detail
                    field={getField("how_is_this_calculated")}
                    title={t`How this metric is calculated`}
                    description={entity.how_is_this_calculated}
                    placeholder={t`Nothing on how it's calculated yet`}
                    isEditing={isEditing}
                  />
                </li>
                {table && !isEditing && (
                  <li className="relative">
                    <Formula
                      type="metric"
                      entity={entity}
                      isExpanded={isFormulaExpanded}
                      expandFormula={expandFormula}
                      collapseFormula={collapseFormula}
                    />
                  </li>
                )}
                {!isEditing && (
                  <li className="relative mt4">
                    <FieldsToGroupBy
                      fields={table.fields
                        .map(fieldId => metadataFields[fieldId])
                        .reduce(
                          (map, field) => ({ ...map, [field.id]: field }),
                          {},
                        )}
                      databaseId={table && table.db_id}
                      metric={entity}
                      title={t`Fields you can group this metric by`}
                      onChangeLocation={onChangeLocation}
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
};

MetricDetail.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(MetricDetail);
