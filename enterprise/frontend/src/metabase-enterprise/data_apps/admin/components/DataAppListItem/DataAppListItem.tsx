import { t } from "ttag";

import { Link } from "metabase/router";
import { ActionIcon, Flex, Group, Icon, Tooltip } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

import { DataAppActionsMenu } from "../DataAppActionsMenu/DataAppActionsMenu";
import { DataAppStatusBadge } from "../DataAppStatusBadge/DataAppStatusBadge";
import { DataAppSummary } from "../DataAppSummary/DataAppSummary";

type Props = {
  app: DataApp;
  canRemove?: boolean;
};

export const DataAppListItem = ({ app, canRemove = false }: Props) => (
  <Flex
    data-testid={`data-app-list-item-${app.name}`}
    justify="space-between"
    align="center"
    gap="lg"
    p="lg"
  >
    <DataAppSummary app={app} />

    <Group flex="0 0 auto" gap="lg" wrap="nowrap" align="center">
      <DataAppStatusBadge app={app} />

      {app.has_user_permission_warnings && (
        <Tooltip label={t`Some users are missing data access.`}>
          <ActionIcon
            aria-label={t`Some users are missing data access.`}
            component={Link}
            to={`/admin/settings/apps/${app.name}/users`}
            bg="background_surface-warning-strong"
            c="text-primary"
            bdrs="sm"
            size="sm"
          >
            <Icon name="warning" size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      <DataAppActionsMenu app={app} canRemove={canRemove} />
    </Group>
  </Flex>
);
