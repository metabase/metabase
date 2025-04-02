import { t } from "ttag";

import { useTranslateContent2 } from "metabase/i18n/components/ContentTranslationContext";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

export function HeaderCollectionBadge({ question }: { question: Question }) {
  const { collection } = question.card();
  const icon = question.type();
  const tc = useTranslateContent2();
  return (
    <HeadBreadcrumbs.Badge to={Urls.collection(collection)} icon={icon}>
      {tc(collection?.name) || t`Our analytics`}
    </HeadBreadcrumbs.Badge>
  );
}
