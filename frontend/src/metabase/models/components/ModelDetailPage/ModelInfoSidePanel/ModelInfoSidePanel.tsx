import React, { useMemo } from "react";
import { t } from "ttag";

import type { Card } from "metabase-types/api";
import type Question from "metabase-lib/lib/Question";

import {
  ModelInfoPanel,
  ModelInfoTitle,
  ModelInfoText,
  ModelInfoSection,
  ModelDescription,
} from "./ModelInfoSidePanel.styled";

interface Props {
  model: Question;
  onChangeDescription: (description: string | null) => void;
}

function ModelInfoSidePanel({ model, onChangeDescription }: Props) {
  const modelCard = model.card() as Card;

  const canWrite = model.canWrite();
  const description = model.description();

  const backingTable = useMemo(() => model.query().sourceTable(), [model]);

  return (
    <ModelInfoPanel>
      <ModelInfoSection>
        <ModelInfoTitle>{t`Description`}</ModelInfoTitle>
        <ModelDescription
          initialValue={description}
          placeholder={
            !description && !canWrite ? t`No description` : t`Add description`
          }
          isOptional
          isMultiline
          isDisabled={!canWrite}
          onChange={onChangeDescription}
        />
      </ModelInfoSection>
      {modelCard.creator && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Contact`}</ModelInfoTitle>
          <ModelInfoText>{modelCard.creator.common_name}</ModelInfoText>
        </ModelInfoSection>
      )}
      {backingTable && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Backing table`}</ModelInfoTitle>
          <ModelInfoText>{backingTable.displayName()}</ModelInfoText>
        </ModelInfoSection>
      )}
    </ModelInfoPanel>
  );
}

export default ModelInfoSidePanel;
