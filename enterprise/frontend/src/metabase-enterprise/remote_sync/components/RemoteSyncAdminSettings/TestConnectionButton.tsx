import { useCallback } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { Button } from "metabase/ui";
import { useTestRemoteSyncConnectionMutation } from "metabase-enterprise/api/remote-sync";
import type {
  RemoteSyncConfigurationSettings,
  TestRemoteSyncConnectionRequest,
} from "metabase-types/api";

import { TOKEN_KEY, URL_KEY } from "../../constants";

interface TestConnectionButtonProps {
  values: RemoteSyncConfigurationSettings;
}

export const TestConnectionButton = ({ values }: TestConnectionButtonProps) => {
  const [testConnection, { isLoading }] = useTestRemoteSyncConnectionMutation();
  const [sendToast] = useToast();

  const handleTestConnection = useCallback(async () => {
    const body: TestRemoteSyncConnectionRequest = {
      [URL_KEY]: values[URL_KEY],
      [TOKEN_KEY]: values[TOKEN_KEY],
    };

    try {
      await testConnection(body).unwrap();
      sendToast({
        message: t`Connected to remote sync repository`,
        icon: "check",
      });
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Could not connect to repository`),
        icon: "warning",
      });
    }
  }, [testConnection, values, sendToast]);

  return (
    <Button
      data-testid="remote-sync-test-connection-button"
      disabled={isLoading || !values[URL_KEY]}
      loading={isLoading}
      onClick={handleTestConnection}
      variant="outline"
    >
      {t`Test connection`}
    </Button>
  );
};
