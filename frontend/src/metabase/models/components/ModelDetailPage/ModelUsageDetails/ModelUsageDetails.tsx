import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";
import Questions, {
  getIcon as getQuestionIcon,
} from "metabase/entities/questions";

import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import {
  EmptyStateContainer,
  EmptyStateTitle,
  EmptyStateActionContainer,
} from "../EmptyState.styled";

import { CardListItem, CardTitle } from "./ModelUsageDetails.styled";

interface OwnProps {
  model: Question;
  hasNewQuestionLink: boolean;
}

interface EntityLoaderProps {
  cards: Card[];
}

type Props = OwnProps & EntityLoaderProps;

function ModelUsageDetails({ model, cards, hasNewQuestionLink }: Props) {
  if (cards.length === 0) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model is not used by any questions yet.`}</EmptyStateTitle>
        {hasNewQuestionLink && (
          <EmptyStateActionContainer>
            <Button
              as={Link}
              to={model.composeDataset().getUrl()}
              icon="add"
            >{t`Create a new question`}</Button>
          </EmptyStateActionContainer>
        )}
      </EmptyStateContainer>
    );
  }

  return (
    <ul>
      {cards.map(card => (
        <li key={card.id}>
          <CardListItem to={Urls.question(card)} aria-label={card.name}>
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
    f: "using_model",
    model_id: model.id(),
  };
}

export default Questions.loadList({
  listName: "cards",
  query: getCardListingQuery,
})(ModelUsageDetails);
