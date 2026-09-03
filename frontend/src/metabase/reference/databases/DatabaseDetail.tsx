import cx from "classnames";
import { useFormik } from "formik";
import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { getShallowFields as getFields } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import Detail from "metabase/reference/components/Detail";
import { EditHeader } from "metabase/reference/components/EditHeader";
import EditableReferenceHeader from "metabase/reference/components/EditableReferenceHeader";
import * as actions from "metabase/reference/reference";
import { updateDatabase } from "metabase/reference/update-actions";
import type { User } from "metabase-types/api";

import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getDatabase,
  getIsEditing,
  getIsFormulaExpanded,
  getUser,
} from "../selectors";
import type { BaseDetailFormFields, StubbedDatabase } from "../types";

interface DatabaseDetailFormFields extends BaseDetailFormFields {
  revision_message?: string;
}

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => {
  const entity = getDatabase(state, props) || {};
  const fields = getFields(state);

  return {
    entity,
    metadataFields: fields,
    user: getUser(state),
    isEditing: getIsEditing(state),
    isFormulaExpanded: getIsFormulaExpanded(state),
  };
};

const mapDispatchToProps = {
  updateDatabase,
  ...actions,
  onSubmit: actions.rUpdateDatabaseDetail,
};

interface DatabaseDetailProps {
  style?: React.CSSProperties;
  entity: StubbedDatabase;
  user: User | null;
  isEditing?: boolean;
  startEditing: () => void;
  endEditing: () => void;
  loading?: boolean;
  loadingError?: unknown;
  // The action handler in reference.ts types its own props parameter.
  onSubmit: (fields: DatabaseDetailFormFields, props: any) => Promise<void>;
}

const DatabaseDetail = (props: DatabaseDetailProps) => {
  const {
    style,
    entity,
    loadingError,
    loading,
    user,
    isEditing,
    startEditing,
    endEditing,
    onSubmit,
  } = props;

  const [saveError, setSaveError] = useState<unknown>(null);

  const {
    isSubmitting,
    getFieldProps,
    getFieldMeta,
    handleSubmit,
    handleReset,
  } = useFormik<DatabaseDetailFormFields>({
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
        type="database"
        name="Details"
        headerIcon="database"
        user={user}
        isEditing={isEditing}
        hasSingleSchema={false}
        hasDisplayName={false}
        startEditing={startEditing}
        displayNameFormField={getFormField("display_name")}
        nameFormField={getFormField("name")}
      />
      <LoadingAndErrorWrapper
        loading={!loadingError && !saveError && (loading || isSubmitting)}
        error={saveError ?? loadingError}
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
                    name={t`Why this database is interesting`}
                    description={entity.points_of_interest}
                    placeholder={t`Nothing interesting yet`}
                    isEditing={isEditing}
                    field={getFormField("points_of_interest")}
                  />
                </li>
                <li className={CS.relative}>
                  <Detail
                    name={t`Things to be aware of about this database`}
                    description={entity.caveats}
                    placeholder={t`Nothing to be aware of yet`}
                    isEditing={isEditing}
                    field={getFormField("caveats")}
                  />
                </li>
              </ul>
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    </form>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(DatabaseDetail);
