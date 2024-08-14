/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { useFormik } from "formik";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import List from "metabase/components/List";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import Detail from "metabase/reference/components/Detail";
import EditHeader from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import { Formula } from "metabase/reference/components/Formula";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";
import * as actions from "metabase/reference/reference";
import { getMetadata } from "metabase/selectors/metadata";

import S from "../components/Detail.module.css";
import {
  getSegment,
  getTable,
  getFields,
  getError,
  getLoading,
  getUser,
  getIsEditing,
  getIsFormulaExpanded,
} from "../selectors";
import { getQuestionUrl } from "../utils";

const interestingQuestions = (table, segment, metadata) => {
  return [
    {
      text: t`Number of ${segment.name}`,
      icon: "number",
      link: getQuestionUrl({
        dbId: table && table.db_id,
        tableId: table.id,
        segmentId: segment.id,
        getCount: true,
        metadata,
      }),
    },
    {
      text: t`See all ${segment.name}`,
      icon: "table2",
      link: getQuestionUrl({
        dbId: table && table.db_id,
        tableId: table.id,
        segmentId: segment.id,
        metadata,
      }),
    },
  ];
};

const mapStateToProps = (state, props) => {
  const entity = getSegment(state, props) || {};
  const fields = getFields(state, props);

  return {
    entity,
    table: getTable(state, props),
    metadataFields: fields,
    metadata: getMetadata(state),
    loading: getLoading(state, props),
    // naming this 'error' will conflict with redux form
    loadingError: getError(state, props),
    user: getUser(state, props),
    isEditing: getIsEditing(state, props),
    isFormulaExpanded: getIsFormulaExpanded(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
  onSubmit: actions.rUpdateSegmentDetail,
};

const validate = values =>
  !values.revision_message
    ? { revision_message: t`Please enter a revision message` }
    : {};

const propTypes = {
  style: PropTypes.object.isRequired,
  entity: PropTypes.object.isRequired,
  table: PropTypes.object,
  user: PropTypes.object.isRequired,
  isEditing: PropTypes.bool,
  startEditing: PropTypes.func.isRequired,
  endEditing: PropTypes.func.isRequired,
  startLoading: PropTypes.func.isRequired,
  endLoading: PropTypes.func.isRequired,
  expandFormula: PropTypes.func.isRequired,
  collapseFormula: PropTypes.func.isRequired,
  setError: PropTypes.func.isRequired,
  updateField: PropTypes.func.isRequired,
  isFormulaExpanded: PropTypes.bool,
  loading: PropTypes.bool,
  loadingError: PropTypes.object,
  metadata: PropTypes.object.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

const SegmentDetail = props => {
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
  } = useFormik({
    validate,
    initialValues: {},
    initialErrors: validate({}),
    onSubmit: fields => onSubmit(fields, { ...props, resetForm: handleReset }),
  });

  const getFormField = name => ({
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
          reinitializeForm={handleReset}
          submitting={isSubmitting}
          revisionMessageFormField={getFormField("revision_message")}
        />
      )}
      <EditableReferenceHeader
        entity={entity}
        table={table}
        type="segment"
        headerIcon="segment"
        headerLink={getQuestionUrl({
          dbId: table && table.db_id,
          tableId: entity.table_id,
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
                    id="description"
                    name={t`Description`}
                    description={entity.description}
                    placeholder={t`No description yet`}
                    isEditing={isEditing}
                    field={getFormField("description")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    id="points_of_interest"
                    name={t`Why this Segment is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    id="caveats"
                    name={t`Things to be aware of about this Segment`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
                  />
                </li>
                {!isEditing && (
                  <li className={CS.relative}>
                    <UsefulQuestions
                      questions={interestingQuestions(table, entity, metadata)}
                    />
                  </li>
                )}
                {table && !isEditing && (
                  <li className={cx(CS.relative, CS.mb4)}>
                    <Formula
                      type="segment"
                      entity={entity}
                      table={table}
                      isExpanded={isFormulaExpanded}
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

SegmentDetail.propTypes = propTypes;

export default connect(mapStateToProps, mapDispatchToProps)(SegmentDetail);
