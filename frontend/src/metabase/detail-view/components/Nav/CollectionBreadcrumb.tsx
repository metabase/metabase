import { CollectionBadge } from "metabase/common/collections/components/CollectionBadge";
import type { CollectionId } from "metabase-types/api";

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
