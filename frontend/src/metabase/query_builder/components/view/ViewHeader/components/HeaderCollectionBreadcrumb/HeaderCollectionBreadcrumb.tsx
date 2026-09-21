import { t } from "ttag";

import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

export function HeaderCollectionBreadcrumb({
  question,
}: {
  question: Question;
}) {
  const { collection } = question.card();
  const icon = question.type();
  return (
    <HeadBreadcrumbs.Breadcrumb to={Urls.collection(collection)} icon={icon}>
      {collection?.name || t`Our analytics`}
    </HeadBreadcrumbs.Breadcrumb>
  );
}
