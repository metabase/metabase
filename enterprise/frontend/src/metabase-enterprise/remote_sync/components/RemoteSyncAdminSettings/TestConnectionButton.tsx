import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
  TestConnectionButton as BaseTestConnectionButton,
  type TestConnectionResult,
} from "metabase/common/components/TestConnectionButton";
import { useTestRemoteSyncConnectionMutation } from "metabase-enterprise/api/remote-sync";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import { TOKEN_KEY, URL_KEY } from "../../constants";

interface TestConnectionButtonProps {
  values: RemoteSyncConfigurationSettings;
}

export const TestConnectionButton = ({ values }: TestConnectionButtonProps) => {
  const [testConnection] = useTestRemoteSyncConnectionMutation();

  const handleTestConnection = async (): Promise<TestConnectionResult> => {
    try {
      await testConnection({
        [URL_KEY]: values[URL_KEY],
        [TOKEN_KEY]: values[TOKEN_KEY],
      }).unwrap();
      return { status: "success" };
    } catch (error) {
      return {
        status: "error",
        message: getErrorMessage(error, t`Could not connect to repository`),
      };
    }
  };

  return (
    <BaseTestConnectionButton
      data-testid="remote-sync-test-connection-button"
      values={values}
      disabled={!values[URL_KEY]}
      onTest={handleTestConnection}
    />
  );
};
