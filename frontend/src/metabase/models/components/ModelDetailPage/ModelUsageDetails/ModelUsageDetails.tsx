import React, { useMemo } from "react";

import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";
import Questions, {
  getIcon as getQuestionIcon,
} from "metabase/entities/questions";

import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";

import type { Card } from "metabase-types/api";
import type { Card as LegacyCardType } from "metabase-types/types/Card";
import type Question from "metabase-lib/lib/Question";

import { isQuestionUsingModel } from "./utils";
import { CardListItem, CardTitle } from "./ModelUsageDetails.styled";

interface Props {
  cards: Card[];
  model: Question;
}

function ModelUsageDetails({ model, cards }: Props) {
  const modelConsumers = useMemo(() => {
    const modelCard = model.card() as Card;
    const modelId = modelCard.id;
    const modelTableId = getQuestionVirtualTableId(modelCard);
    return cards.filter(card =>
      isQuestionUsingModel(card, modelId, modelTableId),
    );
  }, [model, cards]);

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

export default Questions.loadList({ listName: "cards" })(ModelUsageDetails);
