import cx from "classnames";
import { useFormik } from "formik";
import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { selectMetadataProvider } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import S from "metabase/reference/Reference.module.css";
import Detail from "metabase/reference/components/Detail";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import FieldTypeDetail from "metabase/reference/components/FieldTypeDetail";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";
import * as actions from "metabase/reference/reference";
import { updateField } from "metabase/reference/update-actions";
import type * as Lib from "metabase-lib";
import type { DatabaseId, Field, Table, User } from "metabase-types/api";

import type { StateWithReference } from "../selectors";
import { getIsEditing, getIsFormulaExpanded, getUser } from "../selectors";
import type {
  BaseDetailFormFields,
  FieldFormFieldsValues,
  ReferenceLoadingProps,
} from "../types";
import { getQuestionUrl } from "../utils";

interface FieldDetailFormFields
  extends BaseDetailFormFields, FieldFormFieldsValues {
  revision_message?: string;
}

const interestingQuestions = (
  table: Table,
  field: Field,
  metadataProvider: Lib.MetadataProvider,
) => {
  return [
    {
      text: t`Number of ${table.display_name} grouped by ${field.display_name}`,
      icon: "bar" as const,
      link: getQuestionUrl({
        tableId: table.id,
        breakoutField: field,
        getCount: true,
        visualization: "bar",
        metadataProvider: metadataProvider,
      }),
    },
    {
      text: t`Number of ${table.display_name} grouped by ${field.display_name}`,
      icon: "pie" as const,
      link: getQuestionUrl({
        tableId: table.id,
        breakoutField: field,
        getCount: true,
        visualization: "pie",
        metadataProvider: metadataProvider,
      }),
    },
    {
      text: t`All distinct values of ${field.display_name}`,
      icon: "table2" as const,
      link: getQuestionUrl({
        tableId: table.id,
        breakoutField: field,
        metadataProvider: metadataProvider,
      }),
    },
  ];
};

const mapStateToProps = (
  state: StateWithReference,
  props: Pick<FieldDetailProps, "databaseId">,
) => {
  return {
    metadataProvider: selectMetadataProvider(state, props.databaseId ?? null),
    user: getUser(state),
    isEditing: getIsEditing(state),
    isFormulaExpanded: getIsFormulaExpanded(state),
  };
};

const mapDispatchToProps = {
  updateField,
  ...actions,
  onSubmit: actions.rUpdateFieldDetail,
};

interface FieldDetailProps {
  style: React.CSSProperties;
  field: Field | undefined;
  table: Table | undefined;
  databaseId: DatabaseId;
  user: User;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  loading?: boolean;
  loadingError?: unknown;
  metadataProvider: Lib.MetadataProvider;

  onSubmit: (fields: FieldDetailFormFields, props: any) => Promise<void>;
}

const FieldDetail = (props: FieldDetailProps) => {
  const {
    style,
    field: entity,
    table,
    loadingError,
    loading,
    user,
    isEditing,
    startEditing,
    endEditing,
    metadataProvider,
    onSubmit,
  } = props;

  const [saveError, setSaveError] = useState<unknown>(null);

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik<FieldDetailFormFields>({
    initialValues: {},
    onSubmit: async (fields): Promise<void> => {
      setSaveError(null);
      try {
        await onSubmit(fields, { ...props, resetForm: handleReset });
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

  return (
    <form style={style} className={CS.full} onSubmit={handleSubmit}>
      {isEditing && (
        <EditHeader
          hasRevisionHistory={false}
          onSubmit={handleSubmit}
          endEditing={endEditing}
          reinitializeForm={() => handleReset(undefined)}
          submitting={isSubmitting}
          revisionMessageFormField={getFormField("revision_message")}
        />
      )}
      <EditableReferenceHeader
        entity={entity}
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
        loading={!loadingError && !saveError && (loading || isSubmitting)}
        error={saveError ?? loadingError}
      >
        {() =>
          entity == null || table == null ? null : (
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
                <ul>
                  <li>
                    <Detail
                      name={t`Description`}
                      description={entity.description}
                      placeholder={t`No description yet`}
                      isEditing={isEditing}
                      field={getFormField("description")}
                    />
                  </li>
                  {!isEditing && (
                    <li>
                      <Detail
                        name={t`Actual name in database`}
                        description={entity.name}
                        subtitleClass={S.tableActualName}
                      />
                    </li>
                  )}
                  <li>
                    <Detail
                      name={t`Why this field is interesting`}
                      description={entity.points_of_interest}
                      placeholder={t`Nothing interesting yet`}
                      isEditing={isEditing}
                      field={getFormField("points_of_interest")}
                    />
                  </li>
                  <li>
                    <Detail
                      name={t`Things to be aware of about this field`}
                      description={entity.caveats}
                      placeholder={t`Nothing to be aware of yet`}
                      isEditing={isEditing}
                      field={getFormField("caveats")}
                    />
                  </li>

                  {!isEditing && (
                    <li>
                      <Detail
                        name={t`Data type`}
                        description={entity.database_type}
                      />
                    </li>
                  )}
                  <li>
                    <FieldTypeDetail
                      databaseId={table.db_id}
                      field={entity}
                      fieldTypeFormField={getFormField("semantic_type")}
                      foreignKeyFormField={getFormField("fk_target_field_id")}
                      fieldSettingsFormField={getFormField("settings")}
                      isEditing={Boolean(isEditing)}
                    />
                  </li>
                  {!isEditing && (
                    <li>
                      <UsefulQuestions
                        questions={interestingQuestions(
                          table,
                          entity,
                          metadataProvider,
                        )}
                      />
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )
        }
      </LoadingAndErrorWrapper>
    </form>
  );
};

type FieldDetailOwnProps = Pick<
  FieldDetailProps,
  "databaseId" | "table" | "field"
> &
  ReferenceLoadingProps;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(
  // connect HOC tangle: the `metadataActions` / `actions` spreads in
  // `mapDispatchToProps` are untyped, so the dispatch props can't be matched
  // against the component's own props.
  FieldDetail as unknown as React.ComponentType<FieldDetailOwnProps>,
);
