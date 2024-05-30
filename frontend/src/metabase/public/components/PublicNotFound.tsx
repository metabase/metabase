import cx from "classnames";
import { t } from "ttag";

import { NoDataError } from "metabase/components/errors/NoDataError";
import CS from "metabase/css/core/index.css";
import { SyncedEmbedFrame } from "metabase/public/components/EmbedFrame";

export const PublicNotFound = () => (
  <SyncedEmbedFrame className={CS.spread}>
    <div className={cx(CS.flex, CS.layoutCentered, CS.flexFull, CS.flexColumn)}>
      <NoDataError mb="1rem" />
      <div
        className={cx(CS.mt1, CS.h4, CS.smH3, CS.mdH2, CS.textBold)}
      >{t`Not found`}</div>
    </div>
  </SyncedEmbedFrame>
);
