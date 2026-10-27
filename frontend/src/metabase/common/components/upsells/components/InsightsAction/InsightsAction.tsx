import { useState } from "react";
import { t } from "ttag";

import { UpsellUsageAnalytics } from "metabase/common/components/upsells/UpsellUsageAnalytics";
import { UpsellWrapper } from "metabase/common/components/upsells/components/UpsellWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { type InsightsLinkProps, PLUGIN_AUDIT } from "metabase/plugins";
import { ActionIcon, Icon, Popover, Tooltip } from "metabase/ui";
import type { CardType } from "metabase-types/api";

type InsightsActionProps = InsightsLinkProps & {
  /** 'Model' in the sense of 'type of thing', not in the sense of 'dataset' */
  model: "dashboard" | CardType;
};

/** Sidesheet header action: links to the item's usage analytics, or shows
 * the usage analytics upsell when the instance doesn't have them. */
export const InsightsAction = (props: InsightsActionProps) => {
  const hasAuditApp = useHasTokenFeature("audit_app");

  return hasAuditApp ? (
    <PLUGIN_AUDIT.InsightsLink {...props} />
  ) : (
    <InsightsUpsellAction model={props.model} />
  );
};

const InsightsUpsellActionComponent = ({
  model,
}: Pick<InsightsActionProps, "model">) => {
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
        <UpsellUsageAnalytics location={`${model}-sidesheet`} maxWidth={480} />
      </Popover.Dropdown>
    </Popover>
  );
};

const InsightsUpsellAction = UpsellWrapper(InsightsUpsellActionComponent);
