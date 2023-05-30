/* eslint-disable react/prop-types */
import React from "react";
import { jt, t } from "ttag";
import { connect } from "react-redux";
import Banner from "metabase/components/Banner";
import { ExternalLink } from "metabase/core/components/Link";
import MetabaseSettings from "metabase/lib/settings";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

const mapStateToProps = state => ({
  isAdmin: getUserIsAdmin(state),
  tokenStatusStatus: getSetting(state, "token-status")?.status,
});

const AppBanner = ({ isAdmin, tokenStatusStatus }) => {
  let message;
  if (isAdmin && tokenStatusStatus === "past-due") {
    message = (
      <>
        {jt`⚠️ We couldn't process payment for your account. Please ${(
          <ExternalLink className="link" href={MetabaseSettings.storeUrl()}>
            {t`review your payment settings`}
          </ExternalLink>
        )} to avoid service interruptions.`}
      </>
    );
  } else if (isAdmin && tokenStatusStatus === "unpaid") {
    message = (
      <>
        {jt`⚠️ Pro features won’t work right now due to lack of payment. ${(
          <ExternalLink className="link" href={MetabaseSettings.storeUrl()}>
            {t`Review your payment settings`}
          </ExternalLink>
        )} to restore Pro functionality.`}
      </>
    );
  }
  if (message) {
    return <Banner>{message}</Banner>;
  } else {
    return null;
  }
};

export default connect(mapStateToProps)(AppBanner);
