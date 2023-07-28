import { ReactNode } from "react";
import { extractCollectionId } from "metabase/lib/urls";
import CollectionContent from "../../containers/CollectionContent";

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
  const isRoot = collectionId === "root";

  return (
    <>
      <CollectionContent isRoot={isRoot} collectionId={collectionId} />
      {children}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionLanding;
