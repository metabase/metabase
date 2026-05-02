import cx from "classnames";
import { useFormik } from "formik";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { List } from "metabase/common/components/List";
import S from "metabase/common/components/List/List.module.css";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import R from "metabase/reference/Reference.module.css";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Field from "metabase/reference/components/Field";
import F from "metabase/reference/components/Field.module.css";
import * as actions from "metabase/reference/reference";
import type { IconName } from "metabase/ui";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";

import {
  getError,
  getFieldsBySegment,
  getIsEditing,
  getLoading,
  getSegment,
  getUser,
} from "../selectors";

const emptyStateData = {
  get message() {
    return t`Fields in this table will appear here as they're added`;
  },
  icon: "fields" as const,
};

const mapStateToProps = (state: any, props: any) => {
  const data = getFieldsBySegment(state, props);
  return {
    segment: getSegment(state, props),
    entities: data,
    loading: getLoading(state),
    loadingError: getError(state),
    user: getUser(state),
    isEditing: getIsEditing(state),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateFields,
};

interface SegmentFieldListProps {
  segment: any;
  style: React.CSSProperties;

  entities: Record<string, any>;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  startLoading: () => void;
  endLoading: () => void;
  setError: (error: unknown) => void;

  updateField: (...args: any[]) => any;

  user: any;

  table: any;
  loading?: boolean;
  loadingError?: unknown;
  onSubmit?: (
    entities: Record<string, unknown>,
    fields: Record<string, unknown>,

    props: any,
  ) => void;
}

const SegmentFieldList = (props: SegmentFieldListProps) => {
  const {
    segment,
    style,
    entities,
    loadingError,
    loading,
    user,
    table,
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
  } = useFormik<Record<string, unknown>>({
    initialValues: {},
    onSubmit: (fields): void => {
      onSubmit?.(entities, fields, { ...props, resetForm: handleReset });
    },
  });

  const getFormField = (name: string) => ({
    ...getFieldProps(name),
    ...getFieldMeta(name),
  });

  const getNestedFormField = (id: string | number) => ({
    display_name: getFormField(`${id}.display_name`),
    description: getFormField(`${id}.description`),
    semantic_type: getFormField(`${id}.semantic_type`),
    fk_target_field_id: getFormField(`${id}.fk_target_field_id`),
    settings: getFormField(`${id}.settings`),
  });

  return (
    <form style={style} className={CS.full} onSubmit={handleSubmit}>
      {isEditing && (
        <EditHeader
          hasRevisionHistory={false}
          reinitializeForm={() => handleReset(undefined)}
          endEditing={endEditing}
          submitting={isSubmitting}
        />
      )}
      <EditableReferenceHeader
        type="segment"
        headerIcon={modelIconMap.segment}
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
                  {Object.values(entities).map(
                    (entity) =>
                      entity &&
                      entity.id &&
                      entity.name && (
                        <li className={CS.relative} key={entity.id}>
                          <Field
                            databaseId={table.db_id}
                            field={entity}
                            url={`/reference/segments/${segment.id}/fields/${entity.id}`}
                            icon={getIconForField(entity) as IconName}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentFieldList as unknown as React.ComponentType);
