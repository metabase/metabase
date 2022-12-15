import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import MetabaseSettings from "metabase/lib/settings";
import { getEngineNativeType } from "metabase/lib/engine";
import { nativeDrillFallback } from "metabase-lib/queries/drills/native-drill-fallback";

import type { ClickAction, Drill } from "../../../types";
import {
  DrillLearnLink,
  DrillMessage,
  DrillRoot,
} from "./NativeDrillFallback.styled";

const NativeDrillFallback: Drill = ({ question }) => {
  const drill = nativeDrillFallback({ question });
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
    } as ClickAction,
  ];
};

export default NativeDrillFallback;
