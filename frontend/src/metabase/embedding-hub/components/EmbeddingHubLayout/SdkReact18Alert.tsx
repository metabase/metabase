import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import { useSetting } from "metabase/settings";
import { Alert, Icon } from "metabase/ui";

const USAGE_ANALYTICS_QUESTION_URL = "/question/entity/x0tNT76wBT8nXgpO4dCkN";

export function SdkReact18Alert() {
  const hostnames = useSetting("sdk-react-18-hostnames");
  const hasUsageAnalytics = useHasTokenFeature("audit_app");
  const { url: docsUrl } = useDocsUrl("embedding/sdk/introduction", {
    anchor: "modular-embedding-sdk-prerequisites",
  });

  if (!hostnames?.length) {
    return null;
  }

  const docsLink = (
    <ExternalLink key="docs" href={docsUrl}>
      {t`Learn more`}
    </ExternalLink>
  );

  const usageLink = (
    <Link key="usage" to={USAGE_ANALYTICS_QUESTION_URL} variant="brand">
      {t`this page`}
    </Link>
  );

  return (
    <Alert icon={<Icon name="warning" />} color="warning" mb="md">
      {hasUsageAnalytics
        ? jt`We detected React 18 usage in the last 4 days. Metabase 66 removes support for React 18. Please update your host application to React 19 as soon as possible. ${docsLink}. You can find more information about the hosts that use React 18 on ${usageLink}.`
        : jt`We detected React 18 usage in the last 4 days. Metabase 66 removes support for React 18. Please update your host application to React 19 as soon as possible. ${docsLink}.`}
    </Alert>
  );
}
