import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ActionIcon, FixedSizeIcon, Group, Title } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

type SidebarHeaderProps = {
  workspace: Workspace;
  onClose: () => void;
};

export function SidebarHeader({ workspace, onClose }: SidebarHeaderProps) {
  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="workspace-list-sidebar-header"
    >
      <Title className={cx(CS.textWrap)} order={3}>
        {workspace.name}
      </Title>
      <Group gap="xs" wrap="nowrap">
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
