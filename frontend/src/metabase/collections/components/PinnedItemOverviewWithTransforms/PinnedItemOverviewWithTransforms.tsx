import PinnedItemOverview from "../PinnedItemOverview";
import { TransformTablesSection } from "../TransformTablesSection";
import type { CreateBookmark, DeleteBookmark } from "metabase/collections/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import { Stack } from "metabase/ui";

type Props = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: CreateBookmark;
  deleteBookmark: DeleteBookmark;
  items: CollectionItem[];
  collection: Collection;
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
};

export function PinnedItemOverviewWithTransforms(props: Props) {
  const { collection } = props;

  return (
    <Stack gap="xl">
      <PinnedItemOverview {...props} />
      <TransformTablesSection collection={collection} />
    </Stack>
  );
}

export default PinnedItemOverviewWithTransforms;
