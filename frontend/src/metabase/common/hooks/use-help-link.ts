import { useGetBugReportDetailsQuery } from "metabase/api/bug-report";
import { getHelpUrl } from "metabase/common/utils/help-url";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";

export const useHelpLink = (): { visible: boolean; href: string } => {
  const helpLinkSetting = useSetting("help-link");
  const helpLinkCustomDestinationSetting = useSetting(
    "help-link-custom-destination",
  );
  const user = useSelector(getUser);
  const isAdmin = !!user?.is_superuser;
  const isPaidPlan = useSelector(getIsPaidPlan);
  const version = useSetting("version");

  const { data: bugReportDetails } = useGetBugReportDetailsQuery(undefined, {
    skip: !isAdmin || !isPaidPlan,
  });

  const compactBugReportDetailsForUrl = bugReportDetails
    ? encodeURIComponent(JSON.stringify(bugReportDetails))
    : undefined;

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
