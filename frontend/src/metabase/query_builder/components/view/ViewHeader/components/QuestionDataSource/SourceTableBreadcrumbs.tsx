import type { ReactElement } from "react";

import { skipToken, useGetTableQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

import { DataSourceCrumbs } from "./DataSourceCrumbs";

interface Props {
  question: Question;
  variant: "head" | "subhead";
  divider?: ReactElement | string;
  isObjectDetail?: boolean;
}

export function SourceTableBreadcrumbs({ question, ...props }: Props) {
  const query = question.query();
  const tableId = Lib.sourceTableOrCardId(query);

  const { data: table, isFetching } = useGetTableQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  if (table == null || isFetching) {
    return null;
  }

  const collection = table.collection;
  if (collection == null) {
    return <DataSourceCrumbs question={question} {...props} />;
  }

  return (
    <HeadBreadcrumbs
      {...props}
      parts={[
        <HeadBreadcrumbs.Badge
          key="collection"
          to={Urls.collection(collection)}
          icon="table"
          inactiveColor="text-light"
        >
          {collection.name}
        </HeadBreadcrumbs.Badge>,
        <HeadBreadcrumbs.Badge
          key="name"
          to={Urls.queryBuilderTable(table.id, table.db_id)}
          inactiveColor="text-light"
        >
          {table.display_name}
        </HeadBreadcrumbs.Badge>,
      ]}
    />
  );
}
