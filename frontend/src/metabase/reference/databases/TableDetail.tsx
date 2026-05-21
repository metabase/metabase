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
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";
import * as actions from "metabase/reference/reference";
import {
  getShallowFields as getFields,
  getMetadata,
} from "metabase/selectors/metadata";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { User } from "metabase-types/api";

import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getError,
  getHasSingleSchema,
  getIsEditing,
  getIsFormulaExpanded,
  getLoading,
  getTable,
  getUser,
} from "../selectors";
import type { BaseDetailFormFields, StubbedTable } from "../types";
import { getQuestionUrl } from "../utils";

interface TableDetailFormFields extends BaseDetailFormFields {
  revision_message?: string;
}

const interestingQuestions = (table: StubbedTable, metadata: Metadata) => {
  return [
    {
      text: t`Count of ${table.display_name}`,
      icon: "number" as const,
      link: getQuestionUrl({
        dbId: table.db_id!,
        tableId: table.id,
        getCount: true,
        metadata,
      }),
    },
    {
      text: t`See raw data for ${table.display_name}`,
      icon: "table2" as const,
      link: getQuestionUrl({
        dbId: table.db_id!,
        tableId: table.id,
        metadata,
      }),
    },
  ];
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => {
  const entity = getTable(state, props) || {};
  const fields = getFields(state);

  return {
    entity,
    table: getTable(state, props),
    metadataFields: fields,
    metadata: getMetadata(state),
    loading: getLoading(state),
    // naming this 'error' will conflict with redux form
    loadingError: getError(state),
    user: getUser(state),
    isEditing: getIsEditing(state),
    hasSingleSchema: getHasSingleSchema(state, props),
    isFormulaExpanded: getIsFormulaExpanded(state),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateTableDetail,
  onChangeLocation: push,
};

interface TableDetailProps {
  style: React.CSSProperties;
  entity: StubbedTable;
  table: StubbedTable;
  user: User;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  hasSingleSchema?: boolean;
  loading?: boolean;
  loadingError?: unknown;
  metadata: Metadata;

  onSubmit: (fields: TableDetailFormFields, props: any) => void;
}

const TableDetail = (props: TableDetailProps) => {
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
    hasSingleSchema,
    metadata,
    onSubmit,
  } = props;

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik<TableDetailFormFields>({
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
        type="table"
        headerIcon="table2"
        headerLink={getQuestionUrl({
          dbId: entity.db_id!,
          tableId: entity.id,
          metadata,
        })}
        name={t`Details`}
        user={user}
        isEditing={isEditing}
        hasSingleSchema={hasSingleSchema}
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
                    name={t`Why this table is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li>
                  <Detail
                    name={t`Things to be aware of about this table`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
                  />
                </li>
                {!isEditing && (
                  <li>
                    <UsefulQuestions
                      questions={interestingQuestions(table, metadata)}
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
)(TableDetail as unknown as React.ComponentType);
