import cx from "classnames";
import { useFormik } from "formik";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { List } from "metabase/common/components/List";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import Detail from "metabase/reference/components/Detail";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import { Formula } from "metabase/reference/components/Formula";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";
import * as actions from "metabase/reference/reference";
import {
  getShallowFields as getFields,
  getMetadata,
} from "metabase/selectors/metadata";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { User } from "metabase-types/api";

import S from "../components/Detail.module.css";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getError,
  getIsEditing,
  getIsFormulaExpanded,
  getLoading,
  getSegment,
  getTable,
  getUser,
} from "../selectors";
import type {
  BaseDetailFormFields,
  StubbedSegment,
  StubbedTable,
} from "../types";
import { getQuestionUrl } from "../utils";

interface SegmentDetailFormFields extends BaseDetailFormFields {
  revision_message?: string;
}

const interestingQuestions = (
  table: StubbedTable,
  segment: StubbedSegment,
  metadata: Metadata,
) => {
  return [
    {
      text: t`Number of ${segment.name}`,
      icon: "number" as const,
      link: getQuestionUrl({
        dbId: table.db_id!,
        tableId: table.id,
        segmentId: segment.id,
        getCount: true,
        metadata,
      }),
    },
    {
      text: t`See all ${segment.name}`,
      icon: "table2" as const,
      link: getQuestionUrl({
        dbId: table.db_id!,
        tableId: table.id,
        segmentId: segment.id,
        metadata,
      }),
    },
  ];
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => {
  const entity = getSegment(state, props) || {};
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
    isFormulaExpanded: getIsFormulaExpanded(state),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateSegmentDetail,
};

const validate = (values: SegmentDetailFormFields) =>
  !values.revision_message
    ? { revision_message: t`Please enter a revision message` }
    : {};

interface SegmentDetailProps {
  style: React.CSSProperties;
  entity: StubbedSegment;
  table: StubbedTable | undefined;
  user: User;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  expandFormula: () => void;
  collapseFormula: () => void;
  isFormulaExpanded?: boolean;
  loading?: boolean;
  loadingError?: unknown;
  metadata: Metadata;

  onSubmit: (fields: SegmentDetailFormFields, props: any) => void;
}

const SegmentDetail = (props: SegmentDetailProps) => {
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
    expandFormula,
    collapseFormula,
    isFormulaExpanded,
    onSubmit,
  } = props;

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik<SegmentDetailFormFields>({
    validate,
    initialValues: {},
    initialErrors: validate({}),
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
          hasRevisionHistory={true}
          onSubmit={handleSubmit}
          endEditing={endEditing}
          reinitializeForm={() => handleReset(undefined)}
          submitting={isSubmitting}
          revisionMessageFormField={getFormField("revision_message")}
        />
      )}
      {entity && table && (
        <EditableReferenceHeader
          entity={entity}
          type="segment"
          headerIcon={modelIconMap.segment}
          headerLink={getQuestionUrl({
            dbId: table.db_id!,
            tableId: entity.table_id!,
            segmentId: entity.id,
            metadata,
          })}
          name={t`Details`}
          user={user}
          isEditing={isEditing}
          hasSingleSchema={false}
          hasDisplayName={false}
          startEditing={startEditing}
          displayNameFormField={getFormField("display_name")}
          nameFormField={getFormField("name")}
        />
      )}
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
              <List>
                <li>
                  <div className={S.detail}>
                    <div className={S.detailBody}>
                      <div>
                        <div className={S.detailTitle}>
                          {t`Table this is based on`}
                        </div>
                        {table && (
                          <div>
                            <Link
                              className={cx(
                                CS.textBrand,
                                CS.textBold,
                                CS.textParagraph,
                              )}
                              to={`/reference/databases/${table.db_id}/tables/${table.id}`}
                            >
                              <span className={CS.pt1}>
                                {table.display_name}
                              </span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
                <li className={CS.relative}>
                  <Detail
                    name={t`Description`}
                    description={entity.description}
                    placeholder={t`No description yet`}
                    isEditing={isEditing}
                    field={getFormField("description")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    name={t`Why this Segment is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    name={t`Things to be aware of about this Segment`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
                  />
                </li>
                {!isEditing && table && (
                  <li className={CS.relative}>
                    <UsefulQuestions
                      questions={interestingQuestions(table, entity, metadata)}
                    />
                  </li>
                )}
                {table &&
                  !isEditing &&
                  entity.definition &&
                  entity.table_id != null && (
                    <li className={cx(CS.relative, CS.mb4)}>
                      <Formula
                        type="segment"
                        definition={entity.definition}
                        tableId={entity.table_id}
                        isExpanded={Boolean(isFormulaExpanded)}
                        expandFormula={expandFormula}
                        collapseFormula={collapseFormula}
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
)(SegmentDetail as unknown as React.ComponentType);
