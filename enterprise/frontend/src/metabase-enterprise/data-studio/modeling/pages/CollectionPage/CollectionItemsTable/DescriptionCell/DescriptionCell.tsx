import { Cell } from "metabase/browse/components/BrowseTable.styled";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { Skeleton } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import { getItemDescription } from "../utils";

interface DescriptionCellProps {
  item?: CollectionItem;
}

const CONTAINER_NAME = "ItemsTableContainer";

const descriptionProps = {
  containerName: CONTAINER_NAME,
};

export function DescriptionCell({ item }: DescriptionCellProps) {
  return (
    <Cell {...descriptionProps}>
      {item ? (
        <MarkdownPreview
          lineClamp={12}
          allowedElements={["strong", "em"]}
          oneLine
        >
          {getItemDescription(item)}
        </MarkdownPreview>
      ) : (
        <Skeleton natural h="16.8px" />
      )}
    </Cell>
  );
}
