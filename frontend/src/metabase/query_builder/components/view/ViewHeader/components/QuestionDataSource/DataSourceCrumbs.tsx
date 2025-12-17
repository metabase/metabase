import type { ReactElement } from "react";
import _ from "underscore";

import Schema from "metabase/entities/schemas";
import { getDatabaseId } from "metabase/query_builder/selectors";
import type Question from "metabase-lib/v1/Question";
import type { State } from "metabase-types/store";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

import { getDataSourceParts } from "./utils";

interface Props {
  className?: string;
  divider?: ReactElement | string;
  question: Question;
  variant: "head" | "subhead";
  isObjectDetail?: boolean;
}

export const DataSourceCrumbs = _.compose(
  Schema.loadList({
    query: (state: State) => ({
      dbId: getDatabaseId(state),
    }),
    loadingAndErrorWrapper: false,
  }),
)(({ question, variant, isObjectDetail, ...props }: Props) => {
  const parts = getDataSourceParts({
    question,
    subHead: variant === "subhead",
    isObjectDetail,
  });

  return <HeadBreadcrumbs parts={parts} variant={variant} {...props} />;
});
