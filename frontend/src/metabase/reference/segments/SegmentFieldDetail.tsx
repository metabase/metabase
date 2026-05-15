import cx from "classnames";
import { useFormik } from "formik";
import { t } from "ttag";

import { List } from "metabase/common/components/List";
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
import { getMetadata } from "metabase/selectors/metadata";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { FieldId, User } from "metabase-types/api";

import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getError,
  getFieldBySegment,
  getIsEditing,
  getIsFormulaExpanded,
  getLoading,
  getTable,
  getUser,
} from "../selectors";
import type {
  BaseDetailFormFields,
  FieldFormFieldsValues,
  StubbedField,
  StubbedTable,
} from "../types";
import { getQuestionUrl } from "../utils";

interface SegmentFieldDetailFormFields
  extends BaseDetailFormFields, FieldFormFieldsValues {
  revision_message?: string;
}

const interestingQuestions = (
  table: StubbedTable,
  field: StubbedField,
  metadata: Metadata,
) => {
  return [
    {
      text: t`Number of ${table && table.display_name} grouped by ${
        field.display_name
      }`,
      icon: "number" as const,
      link: getQuestionUrl({
        dbId: table.db_id!,
        tableId: table.id,
        fieldId: field.id as FieldId,
        getCount: true,
        metadata,
      }),
    },
    {
      text: t`All distinct values of ${field.display_name}`,
      icon: "table2" as const,
      link: getQuestionUrl({
        dbId: table.db_id!,
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
  const entity = getFieldBySegment(state, props) || {};

  return {
    entity,
    table: getTable(state, props),
    loading: getLoading(state),
    // naming this 'error' will conflict with redux form
    loadingError: getError(state),
    user: getUser(state),
    isEditing: getIsEditing(state),
    isFormulaExpanded: getIsFormulaExpanded(state),
    metadata: getMetadata(state),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateSegmentFieldDetail,
};

interface SegmentFieldDetailProps {
  style: React.CSSProperties;
  entity: StubbedField;
  table: StubbedTable;
  user: User;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  loading?: boolean;
  loadingError?: unknown;
  metadata: Metadata;

  onSubmit: (fields: SegmentFieldDetailFormFields, props: any) => void;
}

const SegmentFieldDetail = (props: SegmentFieldDetailProps) => {
  const {
    style,
    entity,
    table,
    metadata,
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
  } = useFormik<SegmentFieldDetailFormFields>({
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
        headerIcon="field"
        name={t`Details`}
        type="field"
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
              className={cx(CS.pl3, CS.py2, CS.mb4, CS.bgWhite, CS.bordered)}
            >
              <List>
                <li className={CS.relative}>
                  <Detail
                    name={t`Description`}
                    description={entity.description}
                    placeholder={t`No description yet`}
                    isEditing={isEditing}
                    field={getFormField("description")}
                  />
                </li>
                {!isEditing && (
                  <li className={CS.relative}>
                    <Detail
                      name={t`Actual name in database`}
                      description={entity.name}
                      subtitleClass={S.tableActualName}
                    />
                  </li>
                )}
                <li className={CS.relative}>
                  <Detail
                    name={t`Why this field is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    name={t`Things to be aware of about this field`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
                  />
                </li>

                {!isEditing && (
                  <li className={CS.relative}>
                    <Detail
                      name={t`Data type`}
                      description={entity.database_type}
                    />
                  </li>
                )}
                <li className={CS.relative}>
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
                  <li className={CS.relative}>
                    <UsefulQuestions
                      questions={interestingQuestions(table, entity, metadata)}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentFieldDetail as unknown as React.ComponentType);
