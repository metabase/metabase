import { t } from "ttag";

import { UnarchiveCollectionButton } from "metabase/common/collections/components/UnarchiveCollectionButton";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  isCollectionData,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { ActionIcon, FixedSizeIcon, Tooltip } from "metabase/ui";

import type { ArchivedActionRowActions } from "./types";

type ArchivedItemMenuProps = ArchivedActionRowActions & {
  treeItem: TreeItem;
};

export function ArchivedItemMenu({
  treeItem,
  readOnly,
  onUnarchive,
}: ArchivedItemMenuProps) {
  const { data } = treeItem;

  if (readOnly || isEmptyStateData(data) || !data.can_write) {
    return null;
  }

  if (isCollectionData(data)) {
    return <UnarchiveCollectionButton collection={data} />;
  }

  return (
    <Tooltip label={t`Unarchive action`}>
      <ActionIcon
        variant="subtle"
        aria-label={t`Unarchive action`}
        size="md"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onUnarchive({ id: Number(data.id), name: data.name });
        }}
      >
        <FixedSizeIcon name="unarchive" c="text-primary" />
      </ActionIcon>
    </Tooltip>
  );
}
