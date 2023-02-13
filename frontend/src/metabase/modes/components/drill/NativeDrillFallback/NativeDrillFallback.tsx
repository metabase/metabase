import React from "react";
import { t } from "ttag";
import { IFRAMED } from "metabase/lib/dom";
import { getEngineNativeType } from "metabase/lib/engine";
import Question from "metabase-lib/Question";
import { nativeDrillFallback } from "metabase-lib/queries/drills/native-drill-fallback";

import { DrillMessage, DrillRoot } from "./NativeDrillFallback.styled";

interface NativeDrillFallbackProps {
  question: Question;
}

const NativeDrillFallback = ({ question }: NativeDrillFallbackProps) => {
  const drill = nativeDrillFallback({ question });
  if (!drill) {
    return [];
  }

  const { database } = drill;
  const isSql = getEngineNativeType(database.engine) === "sql";

  if (IFRAMED) {
    return [];
  }

  return [
    {
      name: "fallback-native",
      section: "info",
      buttonType: "info",
      title: (
        <DrillRoot>
          <DrillMessage>
            {isSql
              ? t`Drill-through doesn’t work on SQL questions.`
              : t`Drill-through doesn’t work on native questions.`}
          </DrillMessage>
        </DrillRoot>
      ),
    },
  ];
};

export default NativeDrillFallback;
