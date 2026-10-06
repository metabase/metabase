import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import {
  TestConnectionButton,
  type TestConnectionResult,
} from "metabase/common/components/TestConnectionButton";
import { useTestRemoteSyncConnectionMutation } from "metabase-enterprise/api/remote-sync";
import type {
  RemoteSyncConfigurationSettings,
  TestRemoteSyncConnectionRequest,
} from "metabase-types/api";

import { TOKEN_KEY, URL_KEY } from "../../constants";

const getTestResult = (
  isSuccess: boolean,
  error: unknown,
): TestConnectionResult | null => {
  if (error != null) {
    return {
      status: "error",
      message: getErrorMessage(error, t`Could not connect to repository`),
    };
  }

  return isSuccess ? { status: "success" } : null;
};

interface GitTestConnectionButtonProps {
  values: RemoteSyncConfigurationSettings;
}

export const GitTestConnectionButton = ({
  values,
}: GitTestConnectionButtonProps) => {
  const [testConnection, { isSuccess, error, isLoading, originalArgs }] =
    useTestRemoteSyncConnectionMutation();
  const request = useMemo<TestRemoteSyncConnectionRequest>(
    () => ({ [URL_KEY]: values[URL_KEY], [TOKEN_KEY]: values[TOKEN_KEY] }),
    [values],
  );
  const result = _.isEqual(originalArgs, request)
    ? getTestResult(isSuccess, error)
    : null;

  return (
    <TestConnectionButton
      data-testid="remote-sync-test-connection-button"
      result={result}
      isLoading={isLoading}
      disabled={!values[URL_KEY]}
      onClick={() => testConnection(request)}
    />
  );
};
