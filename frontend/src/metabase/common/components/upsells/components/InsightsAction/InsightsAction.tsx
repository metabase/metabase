import { useState } from "react";
import { t } from "ttag";

import { UpsellUsageAnalytics } from "metabase/common/components/upsells/UpsellUsageAnalytics";
import { UpsellWrapper } from "metabase/common/components/upsells/components/UpsellWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { type InsightsLinkProps, PLUGIN_AUDIT } from "metabase/plugins";
import { ActionIcon, Icon, Popover, Tooltip } from "metabase/ui";
import type { CardType } from "metabase-types/api";

const UPSELL_MAX_WIDTH = 480;

type InsightsActionProps = InsightsLinkProps & {
  entityType: "dashboard" | CardType;
};

/**
 * Sidesheet header action. With the `audit_app` feature it links to the item's
 * usage analytics; without it, admins get the usage analytics upsell in a
 * popover and everyone else gets nothing.
 */
export const InsightsAction = ({
  entityType,
  ...linkProps
}: InsightsActionProps) => {
  const hasAuditApp = useHasTokenFeature("audit_app");

  if (hasAuditApp) {
    return <PLUGIN_AUDIT.InsightsLink {...linkProps} />;
  }

  return <InsightsUpsellAction entityType={entityType} />;
};

const InsightsUpsellActionComponent = ({
  entityType,
}: Pick<InsightsActionProps, "entityType">) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-end">
      <Popover.Target>
        <Tooltip label={t`Insights`} disabled={isOpen}>
          <ActionIcon
            variant="subtle"
            size="md"
            c="text-primary"
            aria-label={t`Insights`}
            onClick={() => setIsOpen((isOpen) => !isOpen)}
          >
            <Icon name="insight" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <UpsellUsageAnalytics
          location={`${entityType}-sidesheet`}
          maxWidth={UPSELL_MAX_WIDTH}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

const InsightsUpsellAction = UpsellWrapper(InsightsUpsellActionComponent);
