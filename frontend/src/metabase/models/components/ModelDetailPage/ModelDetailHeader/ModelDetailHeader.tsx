import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

import * as Urls from "metabase/lib/urls";

import type Question from "metabase-lib/Question";

import {
  ModelHeader,
  ModelHeaderButtonsContainer,
  ModelTitle,
  ModelFootnote,
} from "./ModelDetailHeader.styled";

interface Props {
  model: Question;
  onChangeName: (name?: string) => void;
}

function ModelDetailHeader({ model, onChangeName }: Props) {
  const modelCard = model.card();
  const canWrite = model.canWrite();

  const queryEditorLink = Urls.modelEditor(modelCard, { type: "query" });
  const exploreDataLink = Urls.model(modelCard);

  return (
    <ModelHeader>
      <div>
        <ModelTitle
          initialValue={model.displayName()}
          isDisabled={!canWrite}
          onChange={onChangeName}
        />
        <ModelFootnote>{t`Model`}</ModelFootnote>
      </div>
      <ModelHeaderButtonsContainer>
        <Button as={Link} to={queryEditorLink}>{t`Edit definition`}</Button>
        <Button primary as={Link} to={exploreDataLink}>{t`Explore`}</Button>
      </ModelHeaderButtonsContainer>
    </ModelHeader>
  );
}

export default ModelDetailHeader;
