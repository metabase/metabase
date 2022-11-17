import React from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { getEngineNativeType } from "metabase/lib/engine";
import Icon from "metabase/components/Icon";
import Question from "metabase-lib/Question";
import { fallbackNativeDrill } from "metabase-lib/queries/drills/fallback-native-drill";
import {
  DrillLearnLink,
  DrillMessage,
  DrillRoot,
} from "./FallbackNativeDrill.styled";

interface UnsupportedDrillProps {
  question: Question;
}

const FallbackNativeDrill = ({ question }: UnsupportedDrillProps) => {
  const drill = fallbackNativeDrill({ question });
  if (!drill) {
    return [];
  }

  const { database } = drill;
  const isSql = getEngineNativeType(database.engine) === "sql";
  const learnUrl = MetabaseSettings.learnUrl("questions/drill-through");

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
          <DrillLearnLink href={learnUrl}>
            <Icon name="reference" />
            {t`Learn more`}
          </DrillLearnLink>
        </DrillRoot>
      ),
    },
  ];
};

export default FallbackNativeDrill;
