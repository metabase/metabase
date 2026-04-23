import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, FixedSizeIcon, Group } from "metabase/ui";

type SidebarHeaderProps = {
  title: string;
  onClose: () => void;
};

export function SidebarHeader({ title, onClose }: SidebarHeaderProps) {
  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="query-execution-sidebar-header"
    >
      <Box className={CS.textWrap} fz="h3" fw="bold" lh="h3">
        {title}
      </Box>
      <ActionIcon aria-label={t`Close`} onClick={onClose}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
