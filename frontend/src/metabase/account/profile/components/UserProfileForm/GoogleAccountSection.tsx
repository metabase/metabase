import { t } from "ttag";

import {
  useDisconnectBigQueryOAuthMutation,
  useGetBigQueryOAuthStatusQuery,
  useLazyGetBigQueryOAuthAuthorizeUrlQuery,
} from "metabase/api/google-bigquery";
import { Box, Button, Loader, Text } from "metabase/ui";

export function GoogleAccountSection() {
  const { data: status, isLoading } = useGetBigQueryOAuthStatusQuery();
  const [getAuthorizeUrl, { isLoading: isConnecting }] =
    useLazyGetBigQueryOAuthAuthorizeUrlQuery();
  const [disconnect, { isLoading: isDisconnecting }] =
    useDisconnectBigQueryOAuthMutation();

  const handleConnect = async () => {
    const result = await getAuthorizeUrl();
    if (result.data?.url) {
      window.location.href = result.data.url;
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  return (
    <Box mb="lg">
      <Text fw="bold" mb="xs">{t`Google Account`}</Text>
      {isLoading ? (
        <Loader size="sm" />
      ) : status?.connected ? (
        <Box>
          <Text size="sm" c="dimmed" mb="xs">
            {t`Connected as`} {status.email}
          </Text>
          <Button
            variant="subtle"
            color="error"
            size="xs"
            loading={isDisconnecting}
            onClick={handleDisconnect}
          >
            {t`Disconnect`}
          </Button>
        </Box>
      ) : (
        <Box>
          <Text size="sm" c="dimmed" mb="xs">
            {t`Connect your Google account to query BigQuery as yourself.`}
          </Text>
          <Button
            variant="default"
            size="xs"
            loading={isConnecting}
            onClick={handleConnect}
          >
            {t`Connect Google Account`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
