import PropTypes from "prop-types";
import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/components/ContentTranslationContext";
import * as Urls from "metabase/lib/urls";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";

HeaderCollectionBadge.propTypes = {
  question: PropTypes.object.isRequired,
};

export function HeaderCollectionBadge({ question }) {
  const { collection } = question.card();
  const icon = question.type();
  const tc = useTranslateContent();
  return (
    <HeadBreadcrumbs.Badge to={Urls.collection(collection)} icon={icon}>
      {tc(collection, "name") || t`Our analytics`}
    </HeadBreadcrumbs.Badge>
  );
}
