import { useGetCollectionQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getCollectionId } from "metabase/selectors/app";
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
  const statefulCollectionId = useSelector(getCollectionId);
  const collectionId = props.collectionId ?? statefulCollectionId ?? "root";

  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  return (
    <Breadcrumbs
      {...props}
      collection={collection}
      baseCollectionId={props.baseCollectionId ?? null}
    />
  );
};
