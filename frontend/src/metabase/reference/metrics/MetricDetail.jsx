/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { useFormik } from "formik";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import Detail from "metabase/reference/components/Detail";
import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import FieldsToGroupBy from "metabase/reference/components/FieldsToGroupBy";
import { Formula } from "metabase/reference/components/Formula";
import * as actions from "metabase/reference/reference";
import { getMetadata } from "metabase/selectors/metadata";

import {
  getMetric,
  getTable,
  getFields,
  getError,
  getLoading,
  getUser,
  getIsFormulaExpanded,
  getForeignKeys,
} from "../selectors";
import { getQuestionUrl } from "../utils";

const mapStateToProps = (state, props) => {
  const entity = getMetric(state, props) || {};
  const fields = getFields(state, props);

  return {
    entity,
    table: getTable(state, props),
    metadataFields: fields,
    metadata: getMetadata(state),
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

  onSubmit: actions.rUpdateMetricDetail,
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
  isFormulaExpanded: PropTypes.bool,
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  metadata: PropTypes.object.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onChangeLocation: PropTypes.func.isRequired,
};

const MetricDetail = props => {
  const {
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
    metadata,
    onSubmit,
    onChangeLocation,
  } = props;

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik({
    validate,
    initialValues: {},
    initialErrors: validate({}),
    onSubmit: fields =>
      onSubmit(entity, fields, { ...props, resetForm: handleReset }),
  });

  const getFormField = name => ({
    ...getFieldProps(name),
    ...getFieldMeta(name),
  });

  return (
    <form style={style} className={CS.full} onSubmit={handleSubmit}>
      {isEditing && (
        <EditHeader
          hasRevisionHistory={true}
          onSubmit={handleSubmit}
          endEditing={endEditing}
          reinitializeForm={handleReset}
          submitting={isSubmitting}
          revisionMessageFormField={getFormField("revision_message")}
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
          metadata,
        })}
        name={t`Details`}
        user={user}
        isEditing={isEditing}
        hasSingleSchema={false}
        hasDisplayName={false}
        startEditing={startEditing}
        displayNameFormField={getFormField("display_name")}
        nameFormField={getFormField("name")}
      />
      <LoadingAndErrorWrapper
        loading={!loadingError && loading}
        error={loadingError}
      >
        {() => (
          <div className={CS.wrapper}>
            <div
              className={cx(
                CS.pl4,
                CS.pr3,
                CS.pt4,
                CS.mb4,
                CS.mb1,
                CS.bgWhite,
                CS.rounded,
                CS.bordered,
              )}
            >
              <List>
                <li className={CS.relative}>
                  <Detail
                    field={getFormField("description")}
                    name={t`Description`}
                    description={entity.description}
                    placeholder={t`No description yet`}
                    isEditing={isEditing}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    field={getFormField("points_of_interest")}
                    name={t`Why this metric is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    field={getFormField("caveats")}
                    name={t`Things to be aware of about this metric`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    field={getFormField("how_is_this_calculated")}
                    name={t`How this metric is calculated`}
                    description={entity.how_is_this_calculated}
                    placeholder={t`Nothing on how it's calculated yet`}
                    isEditing={isEditing}
                  />
                </li>
                {table && !isEditing && (
                  <li className={CS.relative}>
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
                  <li className={cx(CS.relative, CS.mt4)}>
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
