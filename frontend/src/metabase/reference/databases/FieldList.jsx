/* eslint "react/prop-types": "warn" */
/* eslint-disable react/no-unknown-property */
import cx from "classnames";
import { useFormik } from "formik";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import List from "metabase/components/List";
import S from "metabase/components/List/List.module.css";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import R from "metabase/reference/Reference.module.css";
import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Field from "metabase/reference/components/Field";
import F from "metabase/reference/components/Field.module.css";
import * as actions from "metabase/reference/reference";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";

import {
  getError,
  getFieldsByTable,
  getForeignKeys,
  getIsEditing,
  getLoading,
  getTable,
  getUser,
} from "../selectors";

const emptyStateData = {
  message: t`Fields in this table will appear here as they're added`,
  icon: "fields",
};

const mapStateToProps = (state, props) => {
  const data = getFieldsByTable(state, props);
  return {
    table: getTable(state, props),
    entities: data,
    foreignKeys: getForeignKeys(state, props),
    loading: getLoading(state, props),
    loadingError: getError(state, props),
    user: getUser(state, props),
    isEditing: getIsEditing(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateFields,
};

const propTypes = {
  style: PropTypes.object.isRequired,
  entities: PropTypes.object.isRequired,
  foreignKeys: PropTypes.object.isRequired,
  isEditing: PropTypes.bool,
  startEditing: PropTypes.func.isRequired,
  endEditing: PropTypes.func.isRequired,
  startLoading: PropTypes.func.isRequired,
  endLoading: PropTypes.func.isRequired,
  setError: PropTypes.func.isRequired,
  updateField: PropTypes.func.isRequired,
  user: PropTypes.object.isRequired,
  table: PropTypes.object.isRequired,
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  "data-testid": PropTypes.string,
};

const FieldList = props => {
  const {
    style,
    entities,
    foreignKeys,
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
    onSubmit: fields =>
      onSubmit(entities, fields, { ...props, resetForm: handleReset }),
  });

  const getFormField = name => ({
    ...getFieldProps(name),
    ...getFieldMeta(name),
  });

  const getNestedFormField = id => ({
    display_name: getFormField(`${id}.display_name`),
    semantic_type: getFormField(`${id}.semantic_type`),
    fk_target_field_id: getFormField(`${id}.fk_target_field_id`),
  });

  return (
    <form
      style={style}
      className={CS.full}
      onSubmit={handleSubmit}
      testID={props["data-testid"]}
    >
      {isEditing && (
        <EditHeader
          hasRevisionHistory={false}
          reinitializeForm={handleReset}
          endEditing={endEditing}
          submitting={isSubmitting}
        />
      )}
      <EditableReferenceHeader
        headerIcon="table2"
        name={t`Fields in ${table.display_name}`}
        user={user}
        isEditing={isEditing}
        startEditing={startEditing}
      />
      <LoadingAndErrorWrapper
        loading={!loadingError && loading}
        error={loadingError}
      >
        {() =>
          Object.keys(entities).length > 0 ? (
            <div className={CS.wrapper}>
              <div
                className={cx(
                  CS.pl4,
                  CS.pb2,
                  CS.mb4,
                  CS.bgWhite,
                  CS.rounded,
                  CS.bordered,
                )}
              >
                <div className={S.item}>
                  <div className={R.columnHeader}>
                    <div className={cx(S.itemTitle, F.fieldNameTitle)}>
                      {t`Field name`}
                    </div>
                    <div className={cx(S.itemTitle, F.fieldType)}>
                      {t`Field type`}
                    </div>
                    <div className={cx(S.itemTitle, F.fieldDataType)}>
                      {t`Data type`}
                    </div>
                  </div>
                </div>
                <List>
                  {Object.values(entities)
                    // respect the column sort order
                    .sort((a, b) => a.position - b.position)
                    .map(
                      entity =>
                        entity &&
                        entity.id &&
                        entity.name && (
                          <li key={entity.id}>
                            <Field
                              field={entity}
                              foreignKeys={foreignKeys}
                              url={`/reference/databases/${table.db_id}/tables/${table.id}/fields/${entity.id}`}
                              icon={getIconForField(entity)}
                              isEditing={isEditing}
                              formField={getNestedFormField(entity.id)}
                            />
                          </li>
                        ),
                    )}
                </List>
              </div>
            </div>
          ) : (
            <div className={S.empty}>
              <EmptyState {...emptyStateData} />
            </div>
          )
        }
      </LoadingAndErrorWrapper>
    </form>
  );
};

FieldList.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(FieldList);
