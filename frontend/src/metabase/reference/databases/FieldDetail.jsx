/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { useFormik } from "formik";
import { push } from "react-router-redux";
import { t } from "ttag";
import S from "metabase/reference/Reference.css";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Detail from "metabase/reference/components/Detail";
import FieldTypeDetail from "metabase/reference/components/FieldTypeDetail";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import { getQuestionUrl } from "../utils";

import {
  getDatabase,
  getError,
  getField,
  getForeignKeys,
  getIsEditing,
  getIsFormulaExpanded,
  getLoading,
  getTable,
  getUser,
} from "../selectors";

const interestingQuestions = (database, table, field, metadata) => {
  return [
    {
      text: t`Number of ${table.display_name} grouped by ${field.display_name}`,
      icon: "bar",
      link: getQuestionUrl({
        dbId: database.id,
        tableId: table.id,
        fieldId: field.id,
        getCount: true,
        visualization: "bar",
        metadata,
      }),
    },
    {
      text: t`Number of ${table.display_name} grouped by ${field.display_name}`,
      icon: "pie",
      link: getQuestionUrl({
        dbId: database.id,
        tableId: table.id,
        fieldId: field.id,
        getCount: true,
        visualization: "pie",
        metadata,
      }),
    },
    {
      text: t`All distinct values of ${field.display_name}`,
      icon: "table2",
      link: getQuestionUrl({
        dbId: database.id,
        tableId: table.id,
        fieldId: field.id,
        metadata,
      }),
    },
  ];
};

const mapStateToProps = (state, props) => {
  const entity = getField(state, props) || {};

  return {
    entity,
    field: entity,
    table: getTable(state, props),
    database: getDatabase(state, props),
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
  onSubmit: actions.rUpdateFieldDetail,
  onChangeLocation: push,
};

const propTypes = {
  style: PropTypes.object.isRequired,
  entity: PropTypes.object.isRequired,
  field: PropTypes.object.isRequired,
  table: PropTypes.object,
  user: PropTypes.object.isRequired,
  database: PropTypes.object.isRequired,
  foreignKeys: PropTypes.object,
  isEditing: PropTypes.bool,
  startEditing: PropTypes.func.isRequired,
  endEditing: PropTypes.func.isRequired,
  startLoading: PropTypes.func.isRequired,
  endLoading: PropTypes.func.isRequired,
  setError: PropTypes.func.isRequired,
  updateField: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  metadata: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
};

const FieldDetail = props => {
  const {
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
    metadata,
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
    <form style={style} className="full" onSubmit={handleSubmit}>
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
        type="field"
        headerIcon="field"
        name="Details"
        user={user}
        isEditing={isEditing}
        hasSingleSchema={false}
        hasDisplayName={true}
        startEditing={startEditing}
        displayNameFormField={getFormField("display_name")}
        nameFormField={getFormField("name")}
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
                    field={getFormField("description")}
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
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li className="relative">
                  <Detail
                    id="caveats"
                    name={t`Things to be aware of about this field`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
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
                    fieldTypeFormField={getFormField("semantic_type")}
                    foreignKeyFormField={getFormField("fk_target_field_id")}
                    isEditing={isEditing}
                  />
                </li>
                {!isEditing && (
                  <li className="relative">
                    <UsefulQuestions
                      questions={interestingQuestions(
                        props.database,
                        props.table,
                        props.field,
                        metadata,
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
};

FieldDetail.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(FieldDetail);
