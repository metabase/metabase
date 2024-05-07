import type { Location } from "history";
import type { ReactNode } from "react";

import { TRASH_COLLECTION } from "metabase/entities/collections";
import { isNotNull } from "metabase/lib/types";
import { extractCollectionId } from "metabase/lib/urls";

import { CollectionContent } from "../CollectionContent";

export interface CollectionLandingProps {
  location: Location;
  params: CollectionLandingParams;
  children?: ReactNode;
}

export interface CollectionLandingParams {
  slug: string;
}

const CollectionLanding = ({
  location: { pathname },
  params: { slug },
  children,
}: CollectionLandingProps) => {
  const collectionId =
    pathname === "/trash" ? TRASH_COLLECTION.id : extractCollectionId(slug);

  if (!isNotNull(collectionId)) {
    return null;
  }

  return (
    <>
      <CollectionContent collectionId={collectionId} />
      {children}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionLanding;
