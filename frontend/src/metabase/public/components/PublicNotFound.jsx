import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";

import EmbedFrame from "./EmbedFrame";

const PublicNotFound = () => (
  <EmbedFrame className={CS.spread}>
    <div className="flex layout-centered flex-full flex-column">
      <div
        className={cx(
          QueryBuilderS.QueryErrorImage,
          QueryBuilderS.QueryErrorImageNoRows,
        )}
      />
      <div className="mt1 h4 sm-h3 md-h2 text-bold">{t`Not found`}</div>
    </div>
  </EmbedFrame>
);

export default PublicNotFound;
