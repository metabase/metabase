import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Card } from "metabase-types/api";

import {
  ModelInfoPanel,
  ModelInfoTitle,
  ModelInfoText,
  ModelInfoSection,
  ModelDescription,
  ModelInfoLink,
} from "./ModelInfoSidePanel.styled";
import ModelRelationships from "./ModelRelationships";

interface Props {
  model: Question;
  mainTable?: Table | null;
  onChangeDescription: (description: string | null) => void;
}

function ModelInfoSidePanel({ model, mainTable, onChangeDescription }: Props) {
  const modelCard = model.card() as Card;

  const canWrite = model.canWrite();
  const description = model.description();
  const { isNative } = Lib.queryDisplayInfo(model.query());

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
          isMarkdown
          isDisabled={!canWrite}
          aria-label={t`Description`}
          onChange={onChangeDescription}
        />
      </ModelInfoSection>
      {!isNative && <ModelRelationships model={model} mainTable={mainTable} />}
      {modelCard.creator && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Created by`}</ModelInfoTitle>
          <ModelInfoText aria-label={t`Created by`}>
            {modelCard.creator.common_name}
          </ModelInfoText>
        </ModelInfoSection>
      )}
      {mainTable && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Backing table`}</ModelInfoTitle>
          <ModelInfoLink
            to={ML_Urls.getUrl(mainTable.newQuestion())}
            aria-label={t`Backing table`}
          >
            {mainTable.displayName()}
          </ModelInfoLink>
        </ModelInfoSection>
      )}
    </ModelInfoPanel>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelInfoSidePanel;
