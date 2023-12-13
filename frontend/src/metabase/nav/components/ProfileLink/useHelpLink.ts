import { useEffect, useState } from "react";
import { UtilApi } from "metabase/services";
import { useSelector } from "metabase/lib/redux";
import { getSetting, getIsPaidPlan } from "metabase/selectors/settings";
import { getUser } from "../../../selectors/user";

export const useHelpLink = (): { visible: boolean; href: string } => {
  const helpLinkSetting = useSelector(state => getSetting(state, "help-link"));
  const helpLinkCustomDestinationSetting = useSelector(state =>
    getSetting(state, "help-link-custom-destination"),
  );
  const [bugReportDetails, setBugReportDetails] = useState(null);
  const user = useSelector(getUser);
  const isAdmin = user?.is_superuser;
  const isPaidPlan = useSelector(getIsPaidPlan);
  const version = useSelector(state => getSetting(state, "version"));

  const compactBugReportDetailsForUrl = encodeURIComponent(
    JSON.stringify(bugReportDetails),
  );

  useEffect(() => {
    if (isAdmin && isPaidPlan) {
      UtilApi.bug_report_details().then(setBugReportDetails);
    }
  }, [isAdmin, isPaidPlan]);

  const visible = helpLinkSetting !== "hidden";
  const href =
    helpLinkSetting === "custom"
      ? helpLinkCustomDestinationSetting
      : isAdmin && isPaidPlan
      ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${version.tag}&diag=${compactBugReportDetailsForUrl}`
      : `https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${version.tag}`;

  return { visible, href };
};
