/* eslint-disable react/prop-types */
import React from "react";
import { jt, t } from "ttag";
import Banner from "metabase/components/Banner";
import ExternalLink from "metabase/core/components/Link";
import MetabaseSettings from "metabase/lib/settings";

const AppBanner = ({ messageDescriptor }) => {
  let message = null;
  if (messageDescriptor === "past-due") {
    message = (
      <>
        {jt`We couldn't process payment for your account. Please ${(
          <ExternalLink className="link" href={MetabaseSettings.storeUrl()}>
            {t`review your payment settings`}
          </ExternalLink>
        )} to avoid service interruptions.`}
      </>
    );
  } else if (messageDescriptor === "unpaid") {
    message = (
      <>
        {jt`Pro features won’t work right now due to lack of payment. ${(
          <ExternalLink className="link" href={MetabaseSettings.storeUrl()}>
            {t`Review your payment settings`}
          </ExternalLink>
        )} to restore Pro functionality.`}
      </>
    );
  }
  return message && <Banner>{message}</Banner>;
};

export default AppBanner;
