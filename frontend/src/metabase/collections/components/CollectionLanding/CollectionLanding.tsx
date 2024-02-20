import type { ReactNode } from "react";

import { isNotNull } from "metabase/lib/types";
import { extractCollectionId } from "metabase/lib/urls";

import { CollectionContent } from "../CollectionContent";

export interface CollectionLandingProps {
  params: CollectionLandingParams;
  children?: ReactNode;
}

export interface CollectionLandingParams {
  slug: string;
}

const CollectionLanding = ({
  params: { slug },
  children,
}: CollectionLandingProps) => {
  const collectionId = extractCollectionId(slug);

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
