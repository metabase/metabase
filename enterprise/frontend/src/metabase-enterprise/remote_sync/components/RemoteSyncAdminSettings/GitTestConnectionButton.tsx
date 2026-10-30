import { t } from "ttag";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import {
  TestConnectionButton,
  type TestConnectionResult,
} from "metabase/common/components/TestConnectionButton";
import { useTestRemoteSyncConnectionMutation } from "metabase-enterprise/api/remote-sync";
import type { TestRemoteSyncConnectionRequest } from "metabase-types/api";

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
  url: string | null | undefined;
  token: string | null | undefined;
}

export const GitTestConnectionButton = ({
  url,
  token,
}: GitTestConnectionButtonProps) => {
  const [testConnection, { isSuccess, error, isLoading, originalArgs }] =
    useTestRemoteSyncConnectionMutation();
  const request: TestRemoteSyncConnectionRequest = {
    [URL_KEY]: url,
    [TOKEN_KEY]: token,
  };
  const result = _.isEqual(originalArgs, request)
    ? getTestResult(isSuccess, error)
    : null;

  return (
    <TestConnectionButton
      data-testid="remote-sync-test-connection-button"
      result={result}
      isLoading={isLoading}
      disabled={!url}
      onClick={() => testConnection(request)}
    />
  );
};
