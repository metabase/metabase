import * as Urls from "metabase/lib/urls";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

import { InteractiveQuestionProvider } from "./InteractiveQuestionProvider";
import type { InteractiveQuestionProviderWithLocationProps } from "./types";

export const InteractiveQuestionProviderWithLocation = ({
  location,
  params,
  ...props
}: InteractiveQuestionProviderWithLocationProps) => {
  const cardId = Urls.extractEntityId(params.slug);
  const { options, serializedCard } = parseHash(location.hash);
  const deserializedCard = serializedCard && deserializeCard(serializedCard);

  return (
    <InteractiveQuestionProvider
      cardId={cardId}
      options={options}
      deserializedCard={deserializedCard}
      {...props}
    />
  );
};
