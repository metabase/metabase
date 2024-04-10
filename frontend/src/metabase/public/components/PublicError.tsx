import cx from "classnames";
import { t } from "ttag";

import { NoDataError } from "metabase/components/errors/NoDataError";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getErrorMessage } from "metabase/selectors/app";

import EmbedFrame from "./EmbedFrame";

export const PublicError = () => {
  const message = useSelector(getErrorMessage) ?? t`An error occurred`;

  return (
    <EmbedFrame className={CS.spread}>
      <div
        className={cx(CS.flex, CS.layoutCentered, CS.flexFull, CS.flexColumn)}
      >
        <NoDataError mb="1rem" />
        <div className={cx(CS.mt1, CS.h4, CS.smH3, CS.mdH2, CS.textBold)}>
          {message}
        </div>
      </div>
    </EmbedFrame>
  );
};
