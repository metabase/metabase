import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import {
  automaticDashboardDrill,
  automaticDashboardDrillUrl,
} from "metabase-lib/queries/drills/automatic-dashboard-drill";
import type { Drill } from "../../types";

const AutomaticDashboardDrill: Drill = ({ question, clicked }) => {
  const enableXrays = MetabaseSettings.get("enable-xrays");
  if (!automaticDashboardDrill({ question, clicked, enableXrays })) {
    return [];
  }

  return [
    {
      name: "exploratory-dashboard",
      title: t`X-ray`,
      section: "auto",
      icon: "bolt",
      buttonType: "token",
      url: () => automaticDashboardDrillUrl({ question, clicked }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AutomaticDashboardDrill;
