import type { MouseEvent } from "react";
import { t } from "ttag";

import { Button, FixedSizeIcon } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../../../../utils";

type EntryButtonProps = {
  node: DependencyNode | null;
  onEntryChange: (entry: DependencyEntry | undefined) => void;
  onPickerOpen: () => void;
};

export function EntryButton({
  node,
  onEntryChange,
  onPickerOpen,
}: EntryButtonProps) {
  const handleIconClick = (event: MouseEvent) => {
    event.stopPropagation();
    onEntryChange(undefined);
  };

  return (
    <Button
      leftSection={
        node ? <FixedSizeIcon name={getNodeIcon(node)} /> : undefined
      }
      rightSection={
        node ? (
          <FixedSizeIcon
            name="close"
            display="block"
            aria-label={t`Remove`}
            onClick={handleIconClick}
          />
        ) : undefined
      }
      data-testid="graph-entry-button"
      onClick={onPickerOpen}
    >
      {node ? getNodeLabel(node) : undefined}
    </Button>
  );
}
