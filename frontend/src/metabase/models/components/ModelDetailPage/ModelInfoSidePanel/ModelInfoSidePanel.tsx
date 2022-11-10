import React from "react";
import { t } from "ttag";

import type { Card } from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type Table from "metabase-lib/metadata/Table";

import ModelRelationships from "./ModelRelationships";
import {
  ModelInfoPanel,
  ModelInfoTitle,
  ModelInfoText,
  ModelInfoSection,
  ModelDescription,
  ModelInfoLink,
} from "./ModelInfoSidePanel.styled";

interface Props {
  model: Question;
  mainTable?: Table | null;
  onChangeDescription: (description: string | null) => void;
}

function ModelInfoSidePanel({ model, mainTable, onChangeDescription }: Props) {
  const modelCard = model.card() as Card;

  const canWrite = model.canWrite();
  const description = model.description();

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
      <ModelRelationships model={model} mainTable={mainTable} />
      {modelCard.creator && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Contact`}</ModelInfoTitle>
          <ModelInfoText>{modelCard.creator.common_name}</ModelInfoText>
        </ModelInfoSection>
      )}
      {mainTable && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Backing table`}</ModelInfoTitle>
          <ModelInfoLink to={mainTable.newQuestion().getUrl({ clean: false })}>
            {mainTable.displayName()}
          </ModelInfoLink>
        </ModelInfoSection>
      )}
    </ModelInfoPanel>
  );
}

export default ModelInfoSidePanel;
