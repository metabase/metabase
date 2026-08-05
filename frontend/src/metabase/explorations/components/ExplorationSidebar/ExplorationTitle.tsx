import { useCallback } from "react";
import { t } from "ttag";

import { useUpdateExplorationMutation } from "metabase/api/exploration";
import { EditableText } from "metabase/common/components/EditableText";
import { useToast } from "metabase/common/hooks";
import { EXPLORATION_NAME_MAX_LENGTH } from "metabase/explorations/constants";
import { ActionIcon, Group, Icon, Tooltip } from "metabase/ui";
import type { Exploration } from "metabase-types/api";

interface ExplorationTitleProps {
  exploration: Exploration;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
}

export function ExplorationTitle({
  exploration,
  isSidebarOpen,
  setIsSidebarOpen,
}: ExplorationTitleProps) {
  const [updateExploration] = useUpdateExplorationMutation();
  const [sendToast] = useToast();

  const handleNameChange = useCallback(
    async (name: string) => {
      const { error } = await updateExploration({ id: exploration.id, name });
      if (error) {
        sendToast({
          message: t`Failed to update name`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
      }
    },
    [updateExploration, sendToast, exploration.id],
  );

  return (
    <Group gap={0} wrap="nowrap" align="center">
      <SidebarToggleButton
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
      <EditableText
        initialValue={exploration.name}
        onChange={handleNameChange}
        fw="bold"
        fz="h3"
        lh="h3"
        isDisabled={!exploration.can_write}
        maxLength={EXPLORATION_NAME_MAX_LENGTH}
      />
    </Group>
  );
}

function SidebarToggleButton({
  isSidebarOpen,
  setIsSidebarOpen,
}: {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
}) {
  const label = isSidebarOpen ? t`Close sidebar` : t`Open sidebar`;
  return (
    <Tooltip label={label} openDelay={1000}>
      <ActionIcon
        aria-label={label}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        data-testid="exploration-sidebar-toggle"
        size="2rem"
        variant="viewFooter"
      >
        <Icon name={isSidebarOpen ? "sidebar_closed" : "sidebar_open"} />
      </ActionIcon>
    </Tooltip>
  );
}
