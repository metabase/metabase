import { Flex, Group } from "metabase/ui";
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
    gap="md"
    p="md"
  >
    <DataAppSummary app={app} />

    <Group flex="0 0 auto" gap="md" wrap="nowrap" align="center">
      <DataAppStatusBadge app={app} />

      <DataAppActionsMenu app={app} canRemove={canRemove} />
    </Group>
  </Flex>
);
