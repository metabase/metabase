/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { useFormik } from "formik";
import { t } from "ttag";
import cx from "classnames";
import S from "metabase/components/List/List.css";
import R from "metabase/reference/Reference.css";
import F from "metabase/reference/components/Field.css";

import Field from "metabase/reference/components/Field";
import List from "metabase/components/List";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import { getIconForField } from "metabase-lib/metadata/utils/fields";
import {
  getError,
  getFieldsBySegment,
  getForeignKeys,
  getIsEditing,
  getLoading,
  getSegment,
  getUser,
} from "../selectors";

const emptyStateData = {
  message: t`Fields in this table will appear here as they're added`,
  icon: "fields",
};

const mapStateToProps = (state, props) => {
  const data = getFieldsBySegment(state, props);
  return {
    segment: getSegment(state, props),
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
  segment: PropTypes.object.isRequired,
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
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  onSubmit: PropTypes.func,
};

const SegmentFieldList = props => {
  const {
    segment,
    style,
    entities,
    foreignKeys,
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
    <form style={style} className="full" onSubmit={handleSubmit}>
      {isEditing && (
        <EditHeader
          hasRevisionHistory={false}
          reinitializeForm={handleReset}
          endEditing={endEditing}
          submitting={isSubmitting}
        />
      )}
      <EditableReferenceHeader
        type="segment"
        headerIcon="segment"
        name={t`Fields in ${segment.name}`}
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
                  {Object.values(entities).map(
                    entity =>
                      entity &&
                      entity.id &&
                      entity.name && (
                        <li className="relative" key={entity.id}>
                          <Field
                            field={entity}
                            foreignKeys={foreignKeys}
                            url={`/reference/segments/${segment.id}/fields/${entity.id}`}
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

SegmentFieldList.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(SegmentFieldList);
