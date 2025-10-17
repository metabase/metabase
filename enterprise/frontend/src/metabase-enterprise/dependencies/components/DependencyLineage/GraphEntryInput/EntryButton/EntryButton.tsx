import type { MouseEvent } from "react";
import { t } from "ttag";

import { Button, FixedSizeIcon, UnstyledButton } from "metabase/ui";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../../utils";

type EntryButtonProps = {
  node: DependencyNode | undefined;
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
          <UnstyledButton aria-label={t`Remove`} onClick={handleIconClick}>
            <FixedSizeIcon name="close" />
          </UnstyledButton>
        ) : undefined
      }
      onClick={onPickerOpen}
    >
      {node ? getNodeLabel(node) : undefined}
    </Button>
  );
}
