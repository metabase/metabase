import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import {
  compareToRestDrill,
  compareToRestDrillUrl,
} from "metabase-lib/queries/drills/compare-to-rest-drill";
import type { Drill } from "../../types";

const CompareToRestDrill: Drill = ({ question, clicked }) => {
  const enableXrays = MetabaseSettings.get("enable-xrays");
  if (!compareToRestDrill({ question, clicked, enableXrays })) {
    return [];
  }

  return [
    {
      name: "compare-dashboard",
      title: t`Compare to the rest`,
      section: "auto",
      icon: "bolt",
      buttonType: "token",
      url: () => compareToRestDrillUrl({ question, clicked }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CompareToRestDrill;
