import { t } from "ttag";

import type { PageLinkData } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Anchor, Flex, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

export function MetabotInlinePageLink({
  value: { title, url, model },
}: {
  value: PageLinkData;
}) {
  const getIcon = useGetIcon();
  const iconName: IconName = model ? getIcon({ model }).name : "link";

  return (
    <Flex
      align="center"
      gap="sm"
      bd="1px solid var(--mb-color-border)"
      bdrs="sm"
      p="lg"
      data-testid="metabot-inline-page-link"
    >
      <Icon name={iconName} c="brand" />
      <Anchor
        component={ForwardRefLink}
        to={url}
        fw="bold"
        truncate
        aria-label={t`Open ${title}`}
      >
        {title}
      </Anchor>
    </Flex>
  );
}
