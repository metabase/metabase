import { useFormikContext } from "formik";
import { updateIn } from "icepick";
import type { ComponentType } from "react";
import { type Route, withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useDocsUrl } from "metabase/common/hooks";
import { GenericError } from "metabase/components/ErrorPages";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import {
  FormFooter,
  type FormFooterProps,
} from "metabase/core/components/FormFooter";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import {
  DatabaseForm,
  type DatabaseFormConfig,
  DatabaseFormProvider,
} from "metabase/databases/components/DatabaseForm";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Text } from "metabase/ui";
import type { Database, DatabaseData, DatabaseId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { saveDatabase } from "../database";
import { isDbModifiable } from "../utils";

import S from "./DatabaseEditConnectionForm.module.css";

const makeDefaultSaveDbFn =
  (dispatch: Dispatch) =>
  async (database: DatabaseData): Promise<any> =>
    await dispatch(saveDatabase(database));

export const DatabaseEditConnectionForm = withRouter(
  ({
    database,
    isAttachedDWH,
    initializeError,
    handleSaveDb,
    onSubmitted,
    onCancel,
    route,
    config,
    prepend,
    ...props
  }: {
    database?: Partial<DatabaseData>;
    isAttachedDWH: boolean;
    initializeError?: unknown;
    handleSaveDb?: (database: DatabaseData) => Promise<{ id: DatabaseId }>;
    onSubmitted: (savedDB: { id: DatabaseId }) => void;
    onCancel: () => void;
    route: Route;
    config?: Omit<DatabaseFormConfig, "isAdvanced">;
    prepend?: JSX.Element;
  }) => {
    const dispatch = useDispatch();

    /**
     * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
     * prop has a chance to re-compute on re-render
     */
    const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

    const handleSubmit = async (database: DatabaseData) => {
      try {
        const saveFn = handleSaveDb ?? makeDefaultSaveDbFn(dispatch);
        const savedDB = await saveFn(database);
        scheduleCallback(() => {
          onSubmitted(savedDB);
        });
      } catch (error) {
        throw getSubmitError(error as DatabaseEditErrorType);
      }
    };

    if (!isDbModifiable(database)) {
      return (
        <Text my="md">{t`This database is managed by Metabase Cloud and cannot be modified.`}</Text>
      );
    }

    return (
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <LoadingAndErrorWrapper
          loading={!database}
          error={initializeError}
          noWrapper
        >
          <DatabaseFormProvider
            initialValues={database}
            config={{ isAdvanced: true, ...config }}
            onCancel={onCancel}
            onSubmit={handleSubmit}
            {...props}
          >
            {(props) => (
              <>
                <div className={S.databaseFormBody}>
                  {prepend}
                  <DatabaseForm {...props} />
                </div>
                <DatabaseFormFooter
                  onCancel={onCancel}
                  className={S.databaseFormFooter}
                />
                <LeaveConfirmationModal
                  isEnabled={props.isDirty && !isCallbackScheduled}
                  route={route}
                />
              </>
            )}
          </DatabaseFormProvider>
        </LoadingAndErrorWrapper>
      </ErrorBoundary>
    );
  },
);

interface DatabaseFormFooterProps extends FormFooterProps {
  onCancel?: () => void;
}

export const DatabaseFormFooter = ({
  onCancel,
  ...props
}: DatabaseFormFooterProps) => {
  const { values, dirty } = useFormikContext<DatabaseData>();
  const isNew = values.id == null;

  // eslint-disable-next-line no-unconditional-metabase-links-render -- Metabase setup + admin pages only
  const { url: docsUrl } = useDocsUrl("databases/connecting");

  return (
    <FormFooter data-testid="form-footer" {...props}>
      <FormErrorMessage />
      <Flex justify="space-between" align="center" w="100%">
        {isNew ? (
          <ExternalLink
            key="link"
            href={docsUrl}
            style={{ fontWeight: 500, fontSize: ".875rem" }}
          >
            {t`Need help connecting?`}
          </ExternalLink>
        ) : (
          <div />
        )}

        <Flex gap="sm">
          <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
          <FormSubmitButton
            disabled={!dirty}
            title={isNew ? t`Save` : t`Save changes`}
            primary
          />
        </Flex>
      </Flex>
    </FormFooter>
  );
};

export type DatabaseEditErrorType = {
  data: {
    message: string;
    errors: { [key: string]: string };
  };
  statusText: string;
  message: string;
};

const getSubmitError = (error: DatabaseEditErrorType) => {
  if (_.isObject(error?.data?.errors)) {
    return updateIn(error, ["data", "errors"], (errors) => ({
      details: errors,
    }));
  }

  return error;
};
