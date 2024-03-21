import cx from "classnames";
import { t } from "ttag";

import { NoRowsError } from "metabase/components/errors/NoRowsError";
import CS from "metabase/css/core/index.css";

import EmbedFrame from "./EmbedFrame";

const PublicNotFound = () => (
  <EmbedFrame className={CS.spread}>
    <div className={cx(CS.flex, CS.layoutCentered, CS.flexFull, CS.flexColumn)}>
      <NoRowsError mb="1rem" />
      <div
        className={cx(CS.mt1, CS.h4, "sm-h3 md-h2", CS.textBold)}
      >{t`Not found`}</div>
    </div>
  </EmbedFrame>
);

export default PublicNotFound;
