import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import type { InsightsMenuItemProps } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";

export const InsightsMenuItem = ({
  card,
  label,
  iconName = "external",
}: InsightsMenuItemProps) => {
  const { data: auditInfo, error, isLoading } = useGetAuditInfoQuery();

  if (isLoading || error || !auditInfo?.question_overview) {
    return null;
  }

  if (card.collection?.type === "instance-analytics") {
    return null;
  }

  const params = new URLSearchParams({ question_id: String(card.id) });
  const url = `${Urls.dashboard({ id: auditInfo.question_overview, name: "" })}?${params}`;

  return (
    <Menu.Item
      component={ForwardRefLink}
      to={url}
      target="_blank"
      leftSection={<Icon name={iconName} />}
    >
      {label ?? t`Insights`}
    </Menu.Item>
  );
};
