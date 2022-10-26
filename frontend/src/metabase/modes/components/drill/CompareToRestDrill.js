import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import {
  compareToRestDrill,
  compareToRestDrillUrl,
} from "metabase-lib/queries/drills/compare-to-rest-drill";

export default ({ question, clicked }) => {
  const enableXrays = MetabaseSettings.get("enable-xrays");
  if (!compareToRestDrill({ question, clicked, enableXrays })) {
    return [];
  }

  return [
    {
      name: "compare-dashboard",
      section: "auto",
      icon: "bolt",
      buttonType: "token",
      title: t`Compare to the rest`,
      url: () => compareToRestDrillUrl({ question, clicked }),
    },
  ];
};
