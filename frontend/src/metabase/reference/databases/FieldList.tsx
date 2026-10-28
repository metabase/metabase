import cx from "classnames";
import { useFormik } from "formik";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import R from "metabase/reference/Reference.module.css";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import Field from "metabase/reference/components/Field";
import F from "metabase/reference/components/Field.module.css";
import S from "metabase/reference/components/List/List.module.css";
import * as actions from "metabase/reference/reference";
import { updateField } from "metabase/reference/update-actions";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import type {
  Field as ApiField,
  FieldId,
  IconName,
  Table,
  User,
} from "metabase-types/api";

import type { StateWithReference } from "../selectors";
import { getIsEditing, getUser } from "../selectors";
import type { FieldFormFieldsValues, ReferenceLoadingProps } from "../types";

type FieldListFormFields = Record<string, FieldFormFieldsValues>;

const emptyStateData = {
  get message() {
    return t`Fields in this table will appear here as they're added`;
  },
  icon: "fields" as const,
};

const mapStateToProps = (state: StateWithReference) => {
  return {
    user: getUser(state),
    isEditing: getIsEditing(state),
  };
};

const mapDispatchToProps = {
  updateField,
  ...actions,
  onSubmit: actions.rUpdateFields,
};

interface FieldListProps {
  style: React.CSSProperties;

  fields: ApiField[];
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  user: User | null;
  table: Table | undefined;
  loading?: boolean;
  loadingError?: unknown;
  // The action handler in reference.ts types its own props parameter.
  onSubmit: (
    entities: Record<string, ApiField>,
    fields: FieldListFormFields,
    props: any,
  ) => void;
  "data-testid"?: string;
}

const FieldList = (props: FieldListProps) => {
  const {
    style,
    fields,
    table,
    loadingError,
    loading,
    user,
    isEditing,
    startEditing,
    endEditing,
    onSubmit,
  } = props;

  const [saveError, setSaveError] = useState<unknown>(null);

  // `rUpdateFields` looks each edited field up by id.
  const entitiesById = useMemo(
    () => Object.fromEntries(fields.map((field) => [String(field.id), field])),
    [fields],
  );

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik<FieldListFormFields>({
    initialValues: {},
    onSubmit: async (fields): Promise<void> => {
      setSaveError(null);
      try {
        await onSubmit(entitiesById, fields, {
          ...props,
          resetForm: handleReset,
        });
      } catch (error) {
        console.error(error);
        setSaveError(error);
      }
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
      // Unjustified type cast. FIXME
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
        name={t`Fields in ${table?.display_name}`}
        user={user}
        isEditing={isEditing}
        startEditing={startEditing}
      />
      <LoadingAndErrorWrapper
        loading={!loadingError && !saveError && (loading || isSubmitting)}
        error={saveError ?? loadingError}
      >
        {() =>
          table != null && fields.length > 0 ? (
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
                  {fields
                    // respect the column sort order
                    .toSorted((a, b) => a.position - b.position)
                    .map(
                      (entity) =>
                        entity.id != null && (
                          <li key={String(entity.id)}>
                            <Field
                              databaseId={table.db_id}
                              field={entity}
                              url={`/reference/databases/${table.db_id}/tables/${table.id}/fields/${entity.id}`}
                              // Unjustified type cast. FIXME
                              icon={getIconForField(entity) as IconName}
                              isEditing={isEditing}
                              formField={getNestedFormField(
                                // Unjustified type cast. FIXME
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
  // Unjustified type cast. FIXME
)(
  // `connect` cannot match its inferred props against this component's own
  // props, because the `actions` spread in `mapDispatchToProps` is untyped.
  // The cast restores the props a caller actually passes.
  FieldList as unknown as React.ComponentType<
    ReferenceLoadingProps & Pick<FieldListProps, "table" | "fields">
  >,
);
