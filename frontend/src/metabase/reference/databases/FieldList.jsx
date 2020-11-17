/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import { t } from "ttag";
import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";
import F from "metabase/reference/components/Field.css";

import Field from "metabase/reference/components/Field";
import List from "metabase/components/List";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";

import cx from "classnames";

import {
  getTable,
  getFieldsByTable,
  getForeignKeys,
  getError,
  getLoading,
  getUser,
  getIsEditing,
} from "../selectors";

import { fieldsToFormFields } from "../utils";

import { getIconForField } from "metabase/lib/schema_metadata";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

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
    fields: fieldsToFormFields(data),
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
  form: "fields",
  validate,
})
export default class FieldList extends Component {
  static propTypes = {
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
    handleSubmit: PropTypes.func.isRequired,
    user: PropTypes.object.isRequired,
    fields: PropTypes.object.isRequired,
    table: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
    submitting: PropTypes.bool,
    resetForm: PropTypes.func,
  };

  render() {
    const {
      style,
      entities,
      fields,
      foreignKeys,
      table,
      loadingError,
      loading,
      user,
      isEditing,
      startEditing,
      endEditing,
      resetForm,
      handleSubmit,
      submitting,
    } = this.props;

    return (
      <form
        style={style}
        className="full"
        onSubmit={handleSubmit(
          async formFields =>
            await actions.rUpdateFields(
              this.props.entities,
              formFields,
              this.props,
            ),
        )}
      >
        {isEditing && (
          <EditHeader
            hasRevisionHistory={false}
            reinitializeForm={resetForm}
            endEditing={endEditing}
            submitting={submitting}
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
              <div className="wrapper">
                <div className="pl4 pb2 mb4 bg-white rounded bordered">
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
                                formField={fields[entity.id]}
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
  }
}
