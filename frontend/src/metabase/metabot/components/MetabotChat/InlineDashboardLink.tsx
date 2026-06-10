import { t } from "ttag";

import type { GeneratedDashboard } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Anchor, Flex, Icon } from "metabase/ui";

export function InlineDashboardLink({
  value: { title, url },
}: {
  value: GeneratedDashboard;
}) {
  return (
    <Flex
      align="center"
      gap="sm"
      bd="1px solid var(--mb-color-border)"
      bdrs="md"
      p="md"
      data-testid="metabot-inline-dashboard-link"
    >
      <Icon name="dashboard" c="brand" />
      <Anchor
        component={ForwardRefLink}
        to={url}
        fw="bold"
        truncate
        aria-label={t`Open dashboard`}
      >
        {title}
      </Anchor>
    </Flex>
  );
}
