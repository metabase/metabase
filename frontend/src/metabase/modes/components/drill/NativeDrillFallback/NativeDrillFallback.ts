import { t } from "ttag";
import { isWithinIframe } from "metabase/lib/dom";
import { getEngineNativeType } from "metabase/lib/engine";
import type { RegularClickAction, Drill } from "metabase/modes/types";
import { nativeDrillFallback } from "metabase-lib/queries/drills/native-drill-fallback";

const NativeDrillFallback: Drill = ({ question }) => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NativeDrillFallback;
