/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import React from "react";
import { t } from "ttag";
import Banner from "metabase/components/Banner";
import MetabaseSettings from "metabase/lib/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

const PAST_DUE_ERROR = t`⚠️ We couldn't process payment for your account. Please [review your payment settings](https://store.metabase.com/) to avoid service interruptions.`;
const UNPAID_ERROR = t`⚠️ Pro features won’t work right now due to lack of payment. [Review your payment settings](https://store.metabase.com/) to restore Pro functionality.`;

const mapStateToProps = state => ({
  isAdmin: getUserIsAdmin(state),
  tokenStatus: MetabaseSettings.get("token-status"),
});

const AppBanner = ({ isAdmin, tokenStatus }) => {
  if (
    isAdmin &&
    tokenStatus != null &&
    (tokenStatus.status === "unpaid" || tokenStatus.status === "past-due")
  ) {
    const errorMessage = {
      "past-due": PAST_DUE_ERROR,
      unpaid: UNPAID_ERROR,
    }[tokenStatus.status];
    return <Banner>{errorMessage}</Banner>;
  } else {
    return null;
  }
};

export default connect(mapStateToProps)(AppBanner);
