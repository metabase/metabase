import type { LocationDescriptorObject } from "history";
import { updateIn } from "icepick";
import { type ComponentType, useState } from "react";
import { type Route, withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { GenericError } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import type {
  DatabaseFormConfig,
  FormLocation,
} from "metabase/databases/types";
import { useDispatch } from "metabase/lib/redux";
import { Text } from "metabase/ui";
import type {
  DatabaseData,
  DatabaseEditErrorType,
  DatabaseId,
} from "metabase-types/api";
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
    isAttachedDWH,
    initializeError,
    handleSaveDb,
    onSubmitted,
    onCancel,
    onEngineChange,
    route,
    location,
    config,
    formLocation,
    ...props
  }: {
    database?: Partial<DatabaseData>;
    isAttachedDWH: boolean;
    initializeError?: unknown;
    handleSaveDb?: (database: DatabaseData) => Promise<{ id: DatabaseId }>;
    onSubmitted: (savedDB: { id: DatabaseId }) => void;
    onCancel: () => void;
    onEngineChange?: (engineKey: string | undefined) => void;
    route: Route;
    location: LocationDescriptorObject;
    autofocusFieldName?: string;
    config?: Omit<DatabaseFormConfig, "isAdvanced">;
    formLocation: Extract<FormLocation, "admin" | "full-page">;
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
          {isDbModifiable({
            id: database?.id,
            is_attached_dwh: isAttachedDWH,
          }) ? (
            <DatabaseForm
              initialValues={database}
              autofocusFieldName={autofocusFieldName}
              config={{ isAdvanced: true, ...config }}
              onCancel={onCancel}
              onSubmit={handleSubmit}
              onDirtyStateChange={setIsDirty}
              location={formLocation}
              onEngineChange={onEngineChange}
            />
          ) : (
            <Text my="md">{t`This database is managed by Metabase Cloud and cannot be modified.`}</Text>
          )}
        </LoadingAndErrorWrapper>
        <LeaveRouteConfirmModal
          isEnabled={isDirty && !isCallbackScheduled}
          route={route}
        />
      </ErrorBoundary>
    );
  },
);

const getSubmitError = (error: DatabaseEditErrorType) => {
  if (_.isObject(error?.data?.errors)) {
    return updateIn(error, ["data", "errors"], (errors) => ({
      details: errors,
    }));
  }

  return error;
};
