import cx from "classnames";
import { t } from "ttag";

import { NoDataError } from "metabase/components/errors/NoDataError";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { SyncedEmbedFrame } from "metabase/public/components/EmbedFrame";
import { getErrorMessage } from "metabase/selectors/app";

export const PublicError = () => {
  const message = useSelector(getErrorMessage) ?? t`An error occurred`;

  return (
    <SyncedEmbedFrame className={CS.spread}>
      <div
        className={cx(CS.flex, CS.layoutCentered, CS.flexFull, CS.flexColumn)}
      >
        <NoDataError mb="1rem" />
        <div className={cx(CS.mt1, CS.h4, CS.smH3, CS.mdH2, CS.textBold)}>
          {message.toString()}
        </div>
      </div>
    </SyncedEmbedFrame>
  );
};
