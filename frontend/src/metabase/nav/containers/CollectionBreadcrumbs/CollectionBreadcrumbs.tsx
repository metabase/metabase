import { useGetCollectionQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

import {
  CollectionBreadcrumbs as Breadcrumbs,
  type CollectionBreadcrumbsProps as BreadcrumbsProps,
} from "../../components/CollectionBreadcrumbs/CollectionBreadcrumbs";

type CollectionBreadcrumbsProps = Omit<
  BreadcrumbsProps,
  "collection" | "baseCollectionId"
> & {
  collectionId?: CollectionId;
  baseCollectionId?: CollectionId | null;
};

export const CollectionBreadcrumbs = (props: CollectionBreadcrumbsProps) => {
  const collectionId = props.collectionId ?? "root";

  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  return (
    <Breadcrumbs
      {...props}
      collection={collection}
      baseCollectionId={props.baseCollectionId ?? null}
    />
  );
};
