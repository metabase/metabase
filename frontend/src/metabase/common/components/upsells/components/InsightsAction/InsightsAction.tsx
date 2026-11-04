import { useState } from "react";
import { t } from "ttag";

import { UpsellUsageAnalytics } from "metabase/common/components/upsells/UpsellUsageAnalytics";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { UpsellWrapper } from "metabase/common/components/upsells/components/UpsellWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { type InsightsLinkProps, PLUGIN_AUDIT } from "metabase/plugins";
import { ActionIcon, Icon, Indicator, Popover, Tooltip } from "metabase/ui";
import type { CardType } from "metabase-types/api";

const UPSELL_MAX_WIDTH = 480;
const UPSELL_GEM_SIZE = 12;
const UPSELL_GEM_INDICATOR_SIZE = 14;
const UPSELL_GEM_OFFSET = 3;

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
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-end"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Indicator
          label={<UpsellGem size={UPSELL_GEM_SIZE} />}
          size={UPSELL_GEM_INDICATOR_SIZE}
          offset={UPSELL_GEM_OFFSET}
          color="transparent"
        >
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
        </Indicator>
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
