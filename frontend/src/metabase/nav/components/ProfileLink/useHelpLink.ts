import { useEffect, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { UtilApi } from "metabase/services";

import { getUser } from "../../../selectors/user";

export const useHelpLink = (): { visible: boolean; href: string } => {
  const helpLinkSetting = useSetting("help-link");
  const helpLinkCustomDestinationSetting = useSetting(
    "help-link-custom-destination",
  );
  const [bugReportDetails, setBugReportDetails] = useState(null);
  const user = useSelector(getUser);
  const isAdmin = user?.is_superuser;
  const isPaidPlan = useSelector(getIsPaidPlan);
  const version = useSetting("version");

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
