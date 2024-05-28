import { t } from "ttag";

import { isWithinIframe } from "metabase/lib/dom";
import { getEngineNativeType } from "metabase/lib/engine";
import type {
  RegularClickAction,
  LegacyDrill,
} from "metabase/visualizations/types";
import { nativeDrillFallback } from "metabase-lib/v1/queries/drills/native-drill-fallback";

export const NativeQueryClickFallback: LegacyDrill = ({ question }) => {
  const drill = nativeDrillFallback({ question });
  if (!drill) {
    return [];
  }

  const { database } = drill;
  const isSql = getEngineNativeType(database.engine) === "sql";

  if (isWithinIframe()) {
    return [];
  }

  return [
    {
      name: "fallback-native",
      section: "info",
      buttonType: "info",
      title: isSql
        ? t`Drill-through doesn’t work on SQL questions.`
        : t`Drill-through doesn’t work on native questions.`,
    } as RegularClickAction,
  ];
};
