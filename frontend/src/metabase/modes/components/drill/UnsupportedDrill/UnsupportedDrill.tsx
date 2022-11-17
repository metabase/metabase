import React from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import Icon from "metabase/components/Icon";
import Question from "metabase-lib/Question";
import { unsupportedDrill } from "metabase-lib/queries/drills/unsupported-drill";
import {
  DrillLearnLink,
  DrillMessage,
  DrillRoot,
} from "./UnsupportedDrill.styled";

interface UnsupportedDrillProps {
  question: Question;
}

const UnsupportedDrill = ({ question }: UnsupportedDrillProps) => {
  if (!unsupportedDrill({ question })) {
    return [];
  }

  const learnUrl = MetabaseSettings.learnUrl("questions/drill-through");

  return [
    {
      name: "unsupported",
      section: "info",
      buttonType: "info",
      title: (
        <DrillRoot>
          <DrillMessage>
            {t`Drill-through doesn’t work on SQL questions.`}
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

export default UnsupportedDrill;
