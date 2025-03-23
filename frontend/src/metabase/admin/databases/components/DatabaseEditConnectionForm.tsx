import type { LocationDescriptorObject } from "history";
import { updateIn } from "icepick";
import { type ComponentType, useState } from "react";
import { type Route, withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { GenericError } from "metabase/components/ErrorPages";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import {
  DatabaseForm,
  type EngineFieldState,
} from "metabase/databases/components/DatabaseForm";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import { Text } from "metabase/ui";
import type { Database, DatabaseData, DatabaseId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { saveDatabase } from "../database";
import { isDbModifiable } from "../utils";

const makeDefaultSaveDbFn =
  (dispatch: Dispatch) =>
  async (database: DatabaseData): Promise<any> =>
    await dispatch(saveDatabase(database));

export const DatabaseEditConnectionForm = withRouter(
  ({
    database,
    initializeError,
    engineFieldState,
    handleSaveDb,
    onSubmitted,
    onCancel,
    route,
    location,
    ...props
  }: {
    database?: Partial<Database>;
    initializeError?: DatabaseEditErrorType;
    engineFieldState?: EngineFieldState;
    handleSaveDb?: (database: DatabaseData) => Promise<{ id: DatabaseId }>;
    onSubmitted: (savedDB: { id: DatabaseId }) => void;
    onCancel: () => void;
    route: Route;
    location: LocationDescriptorObject;
    autofocusFieldName?: string;
  }) => {
    const dispatch = useDispatch();

    const [isDirty, setIsDirty] = useState(false);

    const autofocusFieldName =
      location.hash?.slice(1) || props.autofocusFieldName;

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

    return (
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <LoadingAndErrorWrapper loading={!database} error={initializeError}>
          {isDbModifiable(database) ? (
            <DatabaseForm
              initialValues={database}
              isAdvanced
              onCancel={onCancel}
              onSubmit={handleSubmit}
              setIsDirty={setIsDirty}
              autofocusFieldName={autofocusFieldName}
              engineFieldState={engineFieldState}
            />
          ) : (
            <Text my="md">{t`This database is managed by Metabase Cloud and cannot be modified.`}</Text>
          )}
        </LoadingAndErrorWrapper>
        <LeaveConfirmationModal
          isEnabled={isDirty && !isCallbackScheduled}
          route={route}
        />
      </ErrorBoundary>
    );
  },
);

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
    return updateIn(error, ["data", "errors"], errors => ({
      details: errors,
    }));
  }

  return error;
};
