import type { ReactNode } from "react";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import type { Card } from "metabase-types/api";

import { getDashboardContentItemUrl } from "./utils";

type ContentItemLinkProps = {
  item: Card;
  className: string;
  children: ReactNode;
};

export function ContentItemLink({ item, ...props }: ContentItemLinkProps) {
  // Dashcard cards carry no collection type, and only a metric's URL depends on
  // it. ContentLocationCell requests the same collection, so this shares its
  // cached response instead of sending another request.
  const { currentData: collection } = useGetCollectionQuery(
    item.type === "metric" ? { id: item.collection_id ?? "root" } : skipToken,
  );

  return (
    <Link to={getDashboardContentItemUrl(item, collection?.type)} {...props} />
  );
}
