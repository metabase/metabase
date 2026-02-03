import { useEffect, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { getHelpUrl } from "metabase/common/utils/help-url";
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
  const isAdmin = !!user?.is_superuser;
  const isPaidPlan = useSelector(getIsPaidPlan);
  const version = useSetting("version");

  const compactBugReportDetailsForUrl = bugReportDetails
    ? encodeURIComponent(JSON.stringify(bugReportDetails))
    : undefined;

  useEffect(() => {
    if (isAdmin && isPaidPlan) {
      UtilApi.bug_report_details().then(setBugReportDetails);
    }
  }, [isAdmin, isPaidPlan]);

  const visible = helpLinkSetting !== "hidden";
  const showPremiumHelp = isAdmin && isPaidPlan;
  const href =
    helpLinkSetting === "custom"
      ? helpLinkCustomDestinationSetting
      : getHelpUrl(
          showPremiumHelp,
          version.tag,
          showPremiumHelp ? compactBugReportDetailsForUrl : undefined,
        );

  return { visible, href };
};
