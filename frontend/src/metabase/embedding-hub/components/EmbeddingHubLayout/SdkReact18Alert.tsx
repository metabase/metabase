import { t } from "ttag";

import { useListSdkReact18HostsQuery } from "metabase/api/embedding-sdk";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  SdkReact18WarningBody,
  useSdkReact18DocsUrl,
} from "metabase/embedding/settings/SdkReact18Warning";
import { Alert, Icon, Stack } from "metabase/ui";

export function SdkReact18Alert() {
  const { data: hosts = [] } = useListSdkReact18HostsQuery();
  const { url: docsUrl, showMetabaseLinks } = useSdkReact18DocsUrl();

  if (hosts.length === 0) {
    return null;
  }

  return (
    <Alert
      icon={<Icon name="warning" />}
      color="warning"
      title={t`Update host apps to React 19`}
      mb="xl"
    >
      <Stack gap="md" align="flex-start">
        <SdkReact18WarningBody hosts={hosts} />
        {showMetabaseLinks && (
          <ExternalLink href={docsUrl}>{t`Learn more`}</ExternalLink>
        )}
      </Stack>
    </Alert>
  );
}
