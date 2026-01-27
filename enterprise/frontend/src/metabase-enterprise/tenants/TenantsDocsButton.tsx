import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

export const TenantsDocsButton = () => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- we can always show links in admin panels, showMetabaseLinks doesn't apply
  const { url } = useDocsUrl("embedding/tenants");

  if (!url) {
    return null;
  }

  return (
    <ExternalLink href={url}>
      <Tooltip label={t`View documentation`}>
        <ActionIcon
          size="lg"
          variant="outline"
          c="text-primary"
          bd="1px solid var(--mb-color-border)"
        >
          <Icon name="reference" />
        </ActionIcon>
      </Tooltip>
    </ExternalLink>
  );
};
