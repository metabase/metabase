import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useTenantUrls } from "metabase/common/tenants";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

export const EditUserStrategySettingsButton = ({
  page,
}: {
  page: "people" | "tenants";
}) => {
  const tenantUrls = useTenantUrls();
  const to =
    page === "tenants"
      ? tenantUrls.userStrategy()
      : "/admin/people/user-strategy";

  return (
    <Link to={to}>
      <Tooltip label={t`Edit user strategy`}>
        <ActionIcon
          size="lg"
          variant="outline"
          c="text-primary"
          bd="1px solid var(--mb-color-border-neutral)"
        >
          <Icon name="gear" />
        </ActionIcon>
      </Tooltip>
    </Link>
  );
};
