import React, { useMemo } from "react";
import { t } from "ttag";

import type { Card } from "metabase-types/api";
import type Question from "metabase-lib/lib/Question";

import {
  ModelInfoPanel,
  ModelInfoTitle,
  ModelInfoText,
} from "./ModelInfoSidePanel.styled";

interface Props {
  model: Question;
}

function ModelInfoSidePanel({ model }: Props) {
  const modelCard = model.card() as Card;

  const backingTable = useMemo(() => model.query().sourceTable(), [model]);

  return (
    <ModelInfoPanel>
      <ModelInfoTitle>{t`Description`}</ModelInfoTitle>
      <ModelInfoText>{model.description()}</ModelInfoText>
      {modelCard.creator && (
        <>
          <ModelInfoTitle>{t`Contact`}</ModelInfoTitle>
          <ModelInfoText>{modelCard.creator.common_name}</ModelInfoText>
        </>
      )}
      {backingTable && (
        <>
          <ModelInfoTitle>{t`Backing table`}</ModelInfoTitle>
          <ModelInfoText>{backingTable.displayName()}</ModelInfoText>
        </>
      )}
    </ModelInfoPanel>
  );
}

export default ModelInfoSidePanel;
