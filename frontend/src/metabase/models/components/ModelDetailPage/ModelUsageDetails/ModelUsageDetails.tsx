import { t } from "ttag";

import { useListCardsQuery } from "metabase/api";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import { getIcon } from "metabase/entities/questions";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { Center, Icon, Loader } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import {
  EmptyStateActionContainer,
  EmptyStateContainer,
  EmptyStateTitle,
} from "../EmptyState.styled";

import { CardListItem, CardTitle } from "./ModelUsageDetails.styled";

type ModelUsageDetailsProps = {
  model: Question;
  hasNewQuestionLink: boolean;
};

export function ModelUsageDetails({
  model,
  hasNewQuestionLink,
}: ModelUsageDetailsProps) {
  const { data: cards = [], isLoading } = useListCardsQuery({
    f: "using_model",
    model_id: model.id(),
  });

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model is not used by any questions yet.`}</EmptyStateTitle>
        {hasNewQuestionLink && (
          <EmptyStateActionContainer>
            <Button
              as={Link}
              to={ML_Urls.getUrl(model)}
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
            <Icon name={getIcon(card).name as IconName} />
            <CardTitle>{card.name}</CardTitle>
          </CardListItem>
        </li>
      ))}
    </ul>
  );
}
