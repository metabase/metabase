import cx from "classnames";
import { useFormik } from "formik";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import S from "metabase/common/components/List/List.module.css";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import R from "metabase/reference/Reference.module.css";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Field from "metabase/reference/components/Field";
import F from "metabase/reference/components/Field.module.css";
import * as actions from "metabase/reference/reference";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type {
  FieldId,
  IconName,
  NormalizedField,
  User,
} from "metabase-types/api";

import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getError,
  getFieldsByTable,
  getIsEditing,
  getLoading,
  getTable,
  getUser,
} from "../selectors";
import type { FieldFormFieldsValues, StubbedTable } from "../types";

type FieldListFormFields = Record<string, FieldFormFieldsValues>;

const emptyStateData = {
  get message() {
    return t`Fields in this table will appear here as they're added`;
  },
  icon: "fields" as const,
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => {
  const data = getFieldsByTable(state, props);
  return {
    table: getTable(state, props),
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

interface FieldListProps {
  style: React.CSSProperties;

  entities: Record<string, NormalizedField>;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  user: User | null;
  table: StubbedTable;
  loading?: boolean;
  loadingError?: unknown;
  // The action handler in reference.ts types its own props parameter.
  onSubmit: (
    entities: Record<string, NormalizedField>,
    fields: FieldListFormFields,
    props: any,
  ) => void;
  "data-testid"?: string;
}

const FieldList = (props: FieldListProps) => {
  const {
    style,
    entities,
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
  } = useFormik<FieldListFormFields>({
    initialValues: {},
    onSubmit: (fields): void => {
      onSubmit(entities, fields, { ...props, resetForm: handleReset });
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
    <form
      style={style}
      className={CS.full}
      onSubmit={handleSubmit}
      {...({ testID: props["data-testid"] } as Record<string, unknown>)}
    >
      {isEditing && (
        <EditHeader
          hasRevisionHistory={false}
          reinitializeForm={() => handleReset(undefined)}
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
                  CS.px4,
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
                <ul>
                  {Object.values(entities)
                    // respect the column sort order
                    .sort((a, b) => a.position - b.position)
                    .map(
                      (entity) =>
                        entity &&
                        entity.id &&
                        entity.name && (
                          <li key={String(entity.id)}>
                            <Field
                              databaseId={table.db_id!}
                              field={entity}
                              url={`/reference/databases/${table.db_id}/tables/${table.id}/fields/${entity.id}`}
                              icon={getIconForField(entity) as IconName}
                              isEditing={isEditing}
                              formField={getNestedFormField(
                                entity.id as FieldId,
                              )}
                            />
                          </li>
                        ),
                    )}
                </ul>
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
)(FieldList as unknown as React.ComponentType);
