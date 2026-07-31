import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { WorktreesSidebarSectionProps } from "metabase/plugins";
import { ActionIcon, Icon, Text, Tooltip } from "metabase/ui";

import { useWorktrees } from "../../hooks/use-worktrees";

import { CreateWorktreeModal } from "./CreateWorktreeModal";
import { WorktreeNavItem } from "./WorktreeNavItem";

export const WorktreesSidebarSection = ({
  onItemSelect,
  selectedId,
}: WorktreesSidebarSectionProps) => {
  const { worktrees, isEnabled } = useWorktrees();

  const [
    isCreateModalOpen,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);

  if (!isEnabled) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{t`Worktrees`}</SidebarHeading>}
          initialState="expanded"
          iconPosition="right"
          iconSize={8}
          rightAction={
            <Tooltip label={t`Create a new worktree`}>
              <ActionIcon
                aria-label={t`Create a new worktree`}
                color="text-secondary"
                onClick={openCreateModal}
              >
                <Icon name="add" />
              </ActionIcon>
            </Tooltip>
          }
          role="section"
          aria-label={t`Worktrees`}
        >
          {worktrees.length === 0 && (
            <Text c="text-disabled" fz="sm" ta="center">
              {t`No worktrees yet`}
            </Text>
          )}
          {worktrees.map((worktree) => (
            <WorktreeNavItem
              key={worktree.id}
              worktree={worktree}
              selectedId={selectedId}
              onItemSelect={onItemSelect}
            />
          ))}
        </CollapseSection>

        {isCreateModalOpen && (
          <CreateWorktreeModal onClose={closeCreateModal} />
        )}
      </ErrorBoundary>
    </SidebarSection>
  );
};
