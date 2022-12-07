import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import {
  automaticDashboardDrill,
  automaticDashboardDrillUrl,
} from "metabase-lib/queries/drills/automatic-dashboard-drill";

export default ({ question, clicked }) => {
  const enableXrays = MetabaseSettings.get("enable-xrays");
  if (!automaticDashboardDrill({ question, clicked, enableXrays })) {
    return [];
  }

  return [
    {
      name: "exploratory-dashboard",
      section: "auto",
      icon: "bolt",
      buttonType: "token",
      title: t`X-ray`,
      url: () => automaticDashboardDrillUrl({ question, clicked }),
    },
  ];
};
