import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";
import { AreaTab } from "metabase/nav/components/AreaLayout";
import type { ContentStudioSidebarProps } from "metabase/plugins";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";

import { getSectionIcon, getSectionTitle } from "../../content-target";
import { useContentStudioScope } from "../../scope";
import { BranchMenu } from "../BranchMenu";
import { BranchSelector } from "../BranchSelector";
import { CheckOutBranchModal } from "../CheckOutBranchModal";
import { CollectionsSection } from "../CollectionsSection";
import { NewCollectionModal } from "../NewCollectionModal";
import { SnippetsTree } from "../SnippetsTree";
import { TransformsTree } from "../TransformsTree";

export function ContentStudioSidebar({
  isNavbarOpened,
}: ContentStudioSidebarProps) {
  const { worktreeId, setScope } = useContentStudioScope();
  const { worktrees } = useWorktrees();
  const [
    isCheckOutModalOpen,
    { open: openCheckOutModal, close: closeCheckOutModal },
  ] = useDisclosure(false);
  const [
    isNewCollectionModalOpen,
    { open: openNewCollectionModal, close: closeNewCollectionModal },
  ] = useDisclosure(false);

  const selectedWorktree =
    worktrees.find((worktree) => worktree.id === worktreeId) ?? null;

  if (!isNavbarOpened) {
    return <CollapsedSections />;
  }

  return (
    <Stack gap="md">
      <BranchSelector
        onCheckOutBranch={openCheckOutModal}
        branchActions={
          selectedWorktree && <BranchMenu worktree={selectedWorktree} />
        }
      />
      <CollectionsSection onNewCollection={openNewCollectionModal} />
      <Stack gap={0}>
        <TransformsTree />
        <SnippetsTree />
      </Stack>
      {isCheckOutModalOpen && (
        <CheckOutBranchModal
          onClose={closeCheckOutModal}
          onCheckedOut={setScope}
        />
      )}
      {isNewCollectionModalOpen && (
        <NewCollectionModal onClose={closeNewCollectionModal} />
      )}
    </Stack>
  );
}

const SECTION_ROOTS: {
  section: ContentStudioSection;
  getUrl: (params: Urls.ContentStudioScopeParams) => string;
}[] = [
  { section: "collections", getUrl: Urls.contentStudioCollections },
  { section: "transforms", getUrl: Urls.contentStudioTransforms },
  { section: "snippets", getUrl: Urls.contentStudioSnippets },
];

/** The trees do not fit a collapsed navbar, so each one shrinks to its root's icon. */
function CollapsedSections() {
  const { worktreeId, section: currentSection } = useContentStudioScope();

  const scope = worktreeId != null ? { worktreeId } : {};

  return (
    <Stack component="nav" gap="0.75rem" aria-label={t`Content`}>
      {SECTION_ROOTS.map(({ section, getUrl }) => (
        <AreaTab
          key={section}
          label={getSectionTitle(section)}
          icon={getSectionIcon(section)}
          to={getUrl(scope)}
          isSelected={section === currentSection}
          showLabel={false}
        />
      ))}
    </Stack>
  );
}
