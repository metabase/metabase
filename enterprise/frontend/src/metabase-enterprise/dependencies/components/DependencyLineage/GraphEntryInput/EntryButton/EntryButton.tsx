import { Button, FixedSizeIcon } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../../utils";

type EntryButtonProps = {
  node: DependencyNode | undefined;
  onEntryChange: (entry: DependencyEntry | undefined) => void;
};

export function EntryButton({ node, onEntryChange }: EntryButtonProps) {
  const handleClick = () => {
    onEntryChange(undefined);
  };

  return (
    <Button
      leftSection={
        node ? <FixedSizeIcon name={getNodeIcon(node)} /> : undefined
      }
      rightSection={node ? <FixedSizeIcon name="close" /> : undefined}
      onClick={handleClick}
    >
      {node ? getNodeLabel(node) : undefined}
    </Button>
  );
}
