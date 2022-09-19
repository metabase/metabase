import React, { useMemo } from "react";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";

import type { Card } from "metabase-types/api";
import type Question from "metabase-lib/lib/Question";

import {
  ModelInfoPanel,
  ModelInfoTitle,
  ModelInfoText,
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
      <ModelInfoTitle>{t`Description`}</ModelInfoTitle>
      <EditableText
        initialValue={description}
        placeholder={
          !description && !canWrite ? t`No description` : t`Add description`
        }
        isOptional
        isMultiline
        isDisabled={!canWrite}
        onChange={onChangeDescription}
      />
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
