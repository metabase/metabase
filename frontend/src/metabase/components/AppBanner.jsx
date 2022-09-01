/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import React from "react";
import { t } from "ttag";
import Banner from "metabase/components/Banner";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useLicense } from "metabase/admin/settings/hooks/use-license";

const PAST_DUE_ERROR = t`⚠️ We couldn't process payment for your account. Please [review your payment settings](https://store.metabase.com/) to avoid service interruptions.`;
const UNPAID_ERROR = t`⚠️ Pro features won’t work right now due to lack of payment. [Review your payment settings](https://store.metabase.com/) to restore Pro functionality.`;

const mapStateToProps = state => ({
  isAdmin: getUserIsAdmin(state),
});

const AppBanner = ({ isAdmin }) => {
  const { tokenStatus } = useLicense();

  if (
    isAdmin &&
    tokenStatus != null &&
    (tokenStatus.validStatus === "unpaid" ||
      tokenStatus.validStatus === "past-due")
  ) {
    const errorMessage = {
      "past-due": PAST_DUE_ERROR,
      unpaid: UNPAID_ERROR,
    }[tokenStatus.validStatus];
    return <Banner>{errorMessage}</Banner>;
  } else {
    return null;
  }
};

export default connect(mapStateToProps)(AppBanner);
