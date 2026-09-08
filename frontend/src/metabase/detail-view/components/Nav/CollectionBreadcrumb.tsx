import type { CollectionId } from "metabase-types/api";
import { CollectionBadge } from "metabase/common/collections/components/CollectionBadge";

import { Separator } from "./Separator";

interface Props {
  collectionId: CollectionId;
}

export const CollectionBreadcrumb = ({ collectionId }: Props) => (
  <>
    <CollectionBadge collectionId={collectionId} />

    <Separator />
  </>
);
