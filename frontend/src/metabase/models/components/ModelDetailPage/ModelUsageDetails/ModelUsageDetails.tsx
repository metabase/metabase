import React, { useMemo } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";
import Questions, {
  getIcon as getQuestionIcon,
} from "metabase/entities/questions";

import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";

import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { Card as LegacyCardType } from "metabase-types/types/Card";
import type Question from "metabase-lib/lib/Question";

import {
  EmptyStateContainer,
  EmptyStateTitle,
} from "../ModelDetailPage.styled";

import { isQuestionUsingModel } from "./utils";
import { CardListItem, CardTitle } from "./ModelUsageDetails.styled";

interface OwnProps {
  model: Question;
}

interface EntityLoaderProps {
  cards: Card[];
}

type Props = OwnProps & EntityLoaderProps;

function ModelUsageDetails({ model, cards }: Props) {
  const modelConsumers = useMemo(() => {
    const modelCard = model.card() as Card;
    const modelId = modelCard.id;
    const modelTableId = getQuestionVirtualTableId(modelCard);
    return cards.filter(card =>
      isQuestionUsingModel(card, modelId, modelTableId),
    );
  }, [model, cards]);

  if (modelConsumers.length === 0) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model is not used by any questions yet.`}</EmptyStateTitle>
        <Button
          as={Link}
          to={model.composeDataset().getUrl()}
          icon="add"
        >{t`Create a new question`}</Button>
      </EmptyStateContainer>
    );
  }

  return (
    <ul>
      {modelConsumers.map(card => (
        <li key={card.id}>
          <CardListItem to={Urls.question(card as LegacyCardType)}>
            <Icon name={getQuestionIcon(card).name} />
            <CardTitle>{card.name}</CardTitle>
          </CardListItem>
        </li>
      ))}
    </ul>
  );
}

function getCardListingQuery(state: State, { model }: OwnProps) {
  return {
    f: "database",
    model_id: model.databaseId(),
  };
}

export default Questions.loadList({
  listName: "cards",
  query: getCardListingQuery,
})(ModelUsageDetails);
