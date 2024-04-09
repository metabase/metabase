import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Questions, { getIcon } from "metabase/entities/questions";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { State } from "metabase-types/store";

import {
  EmptyStateActionContainer,
  EmptyStateContainer,
  EmptyStateTitle,
} from "../EmptyState.styled";

import { CardListItem, CardTitle } from "./ModelUsageDetails.styled";

interface OwnProps {
  model: Question;
  hasNewQuestionLink: boolean;
}

interface EntityLoaderProps {
  questions: Question[];
}

type Props = OwnProps & EntityLoaderProps;

function ModelUsageDetails({ model, questions, hasNewQuestionLink }: Props) {
  if (questions.length === 0) {
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
      {questions.map(question => (
        <li key={question.id()}>
          <CardListItem
            to={Urls.question(question.card())}
            aria-label={question.displayName() ?? ""}
          >
            <Icon name={getIcon(question.card()).name as IconName} />
            <CardTitle>{question.displayName()}</CardTitle>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Questions.loadList({
  query: getCardListingQuery,
})(ModelUsageDetails);
