/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { useFormik } from "formik";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import Detail from "metabase/reference/components/Detail";
import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import * as actions from "metabase/reference/reference";

import {
  getDatabase,
  getTable,
  getFields,
  getError,
  getLoading,
  getUser,
  getIsEditing,
  getIsFormulaExpanded,
  getForeignKeys,
} from "../selectors";

const mapStateToProps = (state, props) => {
  const entity = getDatabase(state, props) || {};
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
    isFormulaExpanded: getIsFormulaExpanded(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateDatabaseDetail,
  onChangeLocation: push,
};

const propTypes = {
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
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
};

const DatabaseDetail = props => {
  const {
    style,
    entity,
    table,
    loadingError,
    loading,
    user,
    isEditing,
    startEditing,
    endEditing,
    onSubmit,
  } = props;

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik({
    initialValues: {},
    onSubmit: fields => onSubmit(fields, { ...props, resetForm: handleReset }),
  });

  const getFormField = name => ({
    ...getFieldProps(name),
    ...getFieldMeta(name),
  });

  return (
    <form style={style} className={CS.full} onSubmit={handleSubmit}>
      {isEditing && (
        <EditHeader
          hasRevisionHistory={false}
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
        type="database"
        name="Details"
        headerIcon="database"
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
                    id="description"
                    name={t`Description`}
                    description={entity.description}
                    placeholder={t`No description yet`}
                    isEditing={isEditing}
                    field={getFormField("description")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    id="points_of_interest"
                    name={t`Why this database is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    id="caveats"
                    name={t`Things to be aware of about this database`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
                  />
                </li>
              </List>
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    </form>
  );
};

DatabaseDetail.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(DatabaseDetail);
