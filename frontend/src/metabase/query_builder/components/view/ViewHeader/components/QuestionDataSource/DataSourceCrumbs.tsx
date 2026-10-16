import type { ReactElement } from "react";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

import { getDataSourceParts } from "./utils";

interface Props {
  className?: string;
  divider?: ReactElement | string;
  question: Question;
  variant: "head" | "subhead";
  isObjectDetail?: boolean;
}

export function DataSourceCrumbs({
  question,
  variant,
  isObjectDetail,
  ...props
}: Props) {
  const databaseId = Lib.databaseID(question.query());
  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const parts = getDataSourceParts({
    question,
    subHead: variant === "subhead",
    isObjectDetail,
    hasMultipleSchemas: schemas.length > 1,
  });

  return <HeadBreadcrumbs parts={parts} variant={variant} {...props} />;
}
