import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";

HeaderCollectionBadge.propTypes = {
  question: PropTypes.object.isRequired,
};

export function HeaderCollectionBadge({ question }) {
  const { collection } = question.card();
  const icon = question.type();
  return (
    <HeadBreadcrumbs.Badge to={Urls.collection(collection)} icon={icon}>
      {collection?.name || t`Our analytics`}
    </HeadBreadcrumbs.Badge>
  );
}
