/* eslint-disable react/prop-types */
import cx from "classnames";
import { connect } from "react-redux";
import { t } from "ttag";

import { NoDataError } from "metabase/components/errors/NoDataError";
import CS from "metabase/css/core/index.css";
import { getErrorMessage } from "metabase/selectors/app";

import EmbedFrame from "./EmbedFrame";

const mapStateToProps = (state, props) => ({
  message: getErrorMessage(state, props),
});

const PublicError = ({ message = t`An error occurred` }) => (
  <EmbedFrame className={CS.spread}>
    <div className={cx(CS.flex, CS.layoutCentered, CS.flexFull, CS.flexColumn)}>
      <NoDataError mb="1rem" />
      <div className={cx(CS.mt1, CS.h4, CS.smH3, CS.mdH2, CS.textBold)}>
        {message}
      </div>
    </div>
  </EmbedFrame>
);

export default connect(mapStateToProps)(PublicError);
