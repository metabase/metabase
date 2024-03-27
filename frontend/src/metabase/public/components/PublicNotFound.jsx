import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";

import EmbedFrame from "./EmbedFrame";

const PublicNotFound = () => (
  <EmbedFrame className={CS.spread}>
    <div className={cx(CS.flex, CS.layoutCentered, CS.flexFull, CS.flexColumn)}>
      <div
        className={cx(
          QueryBuilderS.QueryErrorImage,
          QueryBuilderS.QueryErrorImageNoRows,
        )}
      />
      <div
        className={cx(CS.mt1, CS.h4, CS.smH3, CS.mdH2, CS.textBold)}
      >{t`Not found`}</div>
    </div>
  </EmbedFrame>
);

export default PublicNotFound;
