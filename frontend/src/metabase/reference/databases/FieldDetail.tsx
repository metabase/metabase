import cx from "classnames";
import { useFormik } from "formik";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import S from "metabase/reference/Reference.module.css";
import Detail from "metabase/reference/components/Detail";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import FieldTypeDetail from "metabase/reference/components/FieldTypeDetail";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";
import * as actions from "metabase/reference/reference";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { FieldId, User } from "metabase-types/api";

import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getDatabase,
  getError,
  getField,
  getIsEditing,
  getIsFormulaExpanded,
  getLoading,
  getTable,
  getUser,
} from "../selectors";
import type {
  BaseDetailFormFields,
  FieldFormFieldsValues,
  StubbedDatabase,
  StubbedField,
  StubbedTable,
} from "../types";
import { getQuestionUrl } from "../utils";

interface FieldDetailFormFields
  extends BaseDetailFormFields, FieldFormFieldsValues {
  revision_message?: string;
}

const interestingQuestions = (
  database: StubbedDatabase,
  table: StubbedTable,
  field: StubbedField,
  metadata: Metadata,
) => {
  return [
    {
      text: t`Number of ${table.display_name} grouped by ${field.display_name}`,
      icon: "bar" as const,
      link: getQuestionUrl({
        dbId: database.id,
        tableId: table.id,
        fieldId: field.id as FieldId,
        getCount: true,
        visualization: "bar",
        metadata,
      }),
    },
    {
      text: t`Number of ${table.display_name} grouped by ${field.display_name}`,
      icon: "pie" as const,
      link: getQuestionUrl({
        dbId: database.id,
        tableId: table.id,
        fieldId: field.id as FieldId,
        getCount: true,
        visualization: "pie",
        metadata,
      }),
    },
    {
      text: t`All distinct values of ${field.display_name}`,
      icon: "table2" as const,
      link: getQuestionUrl({
        dbId: database.id,
        tableId: table.id,
        fieldId: field.id as FieldId,
        metadata,
      }),
    },
  ];
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => {
  const entity = getField(state, props) || {};

  return {
    entity,
    field: entity,
    table: getTable(state, props),
    database: getDatabase(state, props),
    loading: getLoading(state),
    // naming this 'error' will conflict with redux form
    loadingError: getError(state),
    user: getUser(state),
    isEditing: getIsEditing(state),
    isFormulaExpanded: getIsFormulaExpanded(state),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateFieldDetail,
  onChangeLocation: push,
};

interface FieldDetailProps {
  style: React.CSSProperties;
  entity: StubbedField;
  field: StubbedField;
  table: StubbedTable;
  user: User;
  database: StubbedDatabase;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  loading?: boolean;
  loadingError?: unknown;
  metadata: Metadata;

  onSubmit: (fields: FieldDetailFormFields, props: any) => void;
}

const FieldDetail = (props: FieldDetailProps) => {
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
    metadata,
    onSubmit,
  } = props;

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik<FieldDetailFormFields>({
    initialValues: {},
    onSubmit: (fields): void => {
      onSubmit(fields, { ...props, resetForm: handleReset });
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
                    databaseId={table.db_id!}
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
                        props.database,
                        props.table,
                        props.field,
                        metadata,
                      )}
                    />
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    </form>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(FieldDetail as unknown as React.ComponentType);
