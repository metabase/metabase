import { t } from "ttag";

import type { Card } from "metabase-types/api";
import type Question from "metabase-lib/Question";
import * as ML_Urls from "metabase-lib/urls";
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
          aria-label={t`Description`}
          onChange={onChangeDescription}
        />
      </ModelInfoSection>
      {!model.isNative() && (
        <ModelRelationships model={model} mainTable={mainTable} />
      )}
      {modelCard.creator && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Contact`}</ModelInfoTitle>
          <ModelInfoText aria-label={t`Contact`}>
            {modelCard.creator.common_name}
          </ModelInfoText>
        </ModelInfoSection>
      )}
      {mainTable && (
        <ModelInfoSection>
          <ModelInfoTitle>{t`Backing table`}</ModelInfoTitle>
          <ModelInfoLink
            to={ML_Urls.getUrl(mainTable.newQuestion(), { clean: false })}
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
