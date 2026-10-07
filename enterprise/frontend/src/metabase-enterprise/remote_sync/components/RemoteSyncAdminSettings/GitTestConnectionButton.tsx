import { useFormikContext } from "formik";
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

const getConnectionErrorMessage = (error: unknown) =>
  getErrorMessage(error, t`Could not connect to repository`);

const getTestResult = (
  isSuccess: boolean,
  error: unknown,
): TestConnectionResult | null => {
  if (error != null) {
    return { status: "error", message: getConnectionErrorMessage(error) };
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
  const { setFieldError, setFieldTouched } = useFormikContext();
  const [testConnection, { isSuccess, error, isLoading, originalArgs }] =
    useTestRemoteSyncConnectionMutation();
  const request: TestRemoteSyncConnectionRequest = {
    [URL_KEY]: url,
    [TOKEN_KEY]: token,
  };
  const result = _.isEqual(originalArgs, request)
    ? getTestResult(isSuccess, error)
    : null;

  const handleTestConnection = async () => {
    const response = await testConnection(request);
    if (response.error) {
      setFieldTouched(URL_KEY, true, false);
      setFieldError(URL_KEY, getConnectionErrorMessage(response.error));
    }
  };

  return (
    <TestConnectionButton
      data-testid="remote-sync-test-connection-button"
      result={result}
      isLoading={isLoading}
      disabled={!url}
      onClick={handleTestConnection}
    />
  );
};
