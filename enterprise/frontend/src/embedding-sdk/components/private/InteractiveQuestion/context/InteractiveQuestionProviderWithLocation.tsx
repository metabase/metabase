import * as Urls from "metabase/lib/urls";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

import { InteractiveQuestionProvider } from "./InteractiveQuestionProvider";
import type {
  InteractiveQuestionId,
  InteractiveQuestionProviderWithLocationProps,
} from "./types";

export const InteractiveQuestionProviderWithLocation = ({
  location,
  params,
  ...props
}: InteractiveQuestionProviderWithLocationProps) => {
  // If we don't have an ID, it's an ad-hoc question, so we'll set the questionId to null
  const questionId = Urls.extractEntityId(params.slug) ?? null;

  const { options, serializedCard } = parseHash(location.hash);
  const deserializedCard = serializedCard && deserializeCard(serializedCard);

  return (
    <InteractiveQuestionProvider
      questionId={questionId as InteractiveQuestionId}
      options={options}
      deserializedCard={deserializedCard}
      {...props}
    />
  );
};
