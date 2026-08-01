import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { ItemList } from "../..";
import { useOmniPickerContext } from "../../context";
import { useRootItems } from "../../hooks/use-get-root-items";
import { useWorktreeRootItems } from "../../hooks/use-get-worktree-root-items";

type RootItemListProps = {
  isLoading: boolean;
};

export const RootItemList = ({ isLoading }: RootItemListProps) => {
  const { worktreeId } = useOmniPickerContext();

  return worktreeId != null ? (
    <WorktreeRootItemList worktreeId={worktreeId} isLoading={isLoading} />
  ) : (
    <MainRootItemList isLoading={isLoading} />
  );
};

const MainRootItemList = ({ isLoading: isLoadingProp }: RootItemListProps) => {
  const { items, isLoading } = useRootItems();

  return (
    <ItemList
      items={items}
      isLoading={isLoading || isLoadingProp}
      pathIndex={-1}
    />
  );
};

const WorktreeRootItemList = ({
  worktreeId,
  isLoading: isLoadingProp,
}: RootItemListProps & { worktreeId: RemoteSyncWorktreeId }) => {
  const { items, isLoading } = useWorktreeRootItems(worktreeId);

  return (
    <ItemList
      items={items}
      isLoading={isLoading || isLoadingProp}
      pathIndex={-1}
    />
  );
};
