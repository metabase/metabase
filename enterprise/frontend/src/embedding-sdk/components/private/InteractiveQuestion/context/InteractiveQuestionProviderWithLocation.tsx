import * as Urls from "metabase/lib/urls";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

import { InteractiveQuestionProvider } from "./InteractiveQuestionProvider";
import type { InteractiveQuestionProviderWithLocationProps } from "./types";

export const InteractiveQuestionProviderWithLocation = ({
  location,
  params,
  ...props
}: InteractiveQuestionProviderWithLocationProps) => {
  // If we cannot extract an entity ID from the slug, assume we are creating a new question.
  const questionId = Urls.extractEntityId(params.slug) ?? "new";

  const { options, serializedCard } = parseHash(location.hash);
  const deserializedCard = serializedCard && deserializeCard(serializedCard);

  return (
    <InteractiveQuestionProvider
      questionId={questionId}
      options={options}
      deserializedCard={deserializedCard}
      {...props}
    />
  );
};
