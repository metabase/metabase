import type { Settings } from "metabase-types/api";

export const getHelpLink = ({
  customHelpLink,
  customHelpLinkDestination,
  isAdmin,
  isPaidPlan,
  tag,
  bugReportDetails,
}: {
  customHelpLink: Settings["help-link"];
  customHelpLinkDestination: Settings["help-link-custom-destination"];
  isAdmin: boolean;
  isPaidPlan: boolean;
  tag: string;
  bugReportDetails: string;
}): { visible: boolean; href: string } => {
  const visible = customHelpLink !== "hidden";
  const href =
    customHelpLink === "custom"
      ? customHelpLinkDestination
      : isAdmin && isPaidPlan
      ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}&diag=${bugReportDetails}`
      : `https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`;

  return { visible, href };
};
