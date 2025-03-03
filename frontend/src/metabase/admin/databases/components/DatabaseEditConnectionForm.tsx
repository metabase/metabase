import type { LocationDescriptor } from "history";
import { updateIn } from "icepick";
import { type ComponentType, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { GenericError } from "metabase/components/ErrorPages";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { DatabaseHelpCard } from "metabase/databases/components/DatabaseHelpCard";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseData } from "metabase-types/api";

import { saveDatabase } from "../database";

export const DatabaseEditConnectionForm = ({
  database,
  initializeError,
  onChangeLocation,
  onSubmitted,
  route,
}: {
  database?: Database;
  initializeError?: DatabaseEditErrorType;
  onChangeLocation: (location: LocationDescriptor) => void;
  onSubmitted: () => void;
  route: Route;
}) => {
  const dispatch = useDispatch();

  const editingExistingDatabase = database?.id != null;
  const addingNewDatabase = !editingExistingDatabase;

  const [isDirty, setIsDirty] = useState(false);

  const autofocusFieldName = window.location.hash.slice(1);

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const handleSubmit = async (database: DatabaseData) => {
    try {
      const savedDB = await dispatch(saveDatabase(database));
      // TODO: move into onSubmitted call
      if (addingNewDatabase) {
        scheduleCallback(() => {
          onChangeLocation(
            `/admin/databases?created=true&createdDbId=${savedDB.id}`,
          );
        });
      } else {
        scheduleCallback(() => {
          onSubmitted();
        });
      }
    } catch (error) {
      throw getSubmitError(error as DatabaseEditErrorType);
    }
  };

  // TODO: make sure connection stuff refetches once the details have been edited...

  // TODO: we should move the can't be modified state up somehow...
  // though if this is attached to a route, then I guess this state needs to be here as well

  return (
    <ErrorBoundary errorComponent={GenericError as ComponentType}>
      <LoadingAndErrorWrapper error={initializeError}>
        {editingExistingDatabase && database.is_attached_dwh ? (
          <div>{t`This database cannot be modified.`}</div>
        ) : (
          <>
            <Box maw="21rem" mt="1.25rem">
              {addingNewDatabase && <DatabaseHelpCard />}
            </Box>
            <DatabaseForm
              initialValues={database}
              isAdvanced
              onSubmit={handleSubmit}
              setIsDirty={setIsDirty}
              autofocusFieldName={autofocusFieldName}
            />
          </>
        )}
      </LoadingAndErrorWrapper>
      <LeaveConfirmationModal
        isEnabled={isDirty && !isCallbackScheduled}
        route={route}
      />
    </ErrorBoundary>
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
    return updateIn(error, ["data", "errors"], errors => ({
      details: errors,
    }));
  }

  return error;
};
