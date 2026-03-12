import type { ReactElement } from "react";

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
  const parts = getDataSourceParts({
    question,
    subHead: variant === "subhead",
    isObjectDetail,
  });

  return <HeadBreadcrumbs parts={parts} variant={variant} {...props} />;
}
