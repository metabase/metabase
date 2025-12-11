import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";

import { useGetCollectionQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { getCollectionList } from "metabase/nav/components/CollectionBreadcrumbs/utils";
import type { Table } from "metabase-types/api";

import { type BreadcrumbItem, Breadcrumbs } from "./Breadcrumbs";

type PublishedTableBreadcrumbsProps = {
  table: Table;
  entityName: string | undefined;
  newEntityLabel: string;
  tableListUrl: string;
};

export function PublishedTableBreadcrumbs({
  table,
  entityName,
  newEntityLabel,
  tableListUrl,
}: PublishedTableBreadcrumbsProps) {
  const { data: collection } = useGetCollectionQuery(
    table.collection_id != null ? { id: table.collection_id } : skipToken,
  );

  const items: BreadcrumbItem[] = useMemo(() => {
    const result: BreadcrumbItem[] = [];

    const ancestors = collection ? getCollectionList({ collection }) : [];

    for (const ancestor of ancestors) {
      result.push({
        label: ancestor.name,
        to: Urls.dataStudioCollection(ancestor.id),
      });
    }

    if (collection) {
      result.push({
        label: collection.name,
        to: Urls.dataStudioCollection(collection.id),
      });
    }

    result.push({
      label: table.display_name,
      to: tableListUrl,
    });

    result.push({
      label: entityName ?? newEntityLabel,
    });

    return result;
  }, [
    collection,
    table.display_name,
    tableListUrl,
    entityName,
    newEntityLabel,
  ]);

  return <Breadcrumbs items={items} />;
}
