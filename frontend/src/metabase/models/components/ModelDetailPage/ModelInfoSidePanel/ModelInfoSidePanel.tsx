import React, { useMemo } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import type { Card, Table } from "metabase-types/api";
import type Question from "metabase-lib/lib/Question";

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
          <ModelInfoLink
            to={backingTable.newQuestion().getUrl({ clean: false })}
          >
            {backingTable.displayName()}
          </ModelInfoLink>
        </ModelInfoSection>
      )}
    </ModelInfoPanel>
  );
}

export default ModelInfoSidePanel;
