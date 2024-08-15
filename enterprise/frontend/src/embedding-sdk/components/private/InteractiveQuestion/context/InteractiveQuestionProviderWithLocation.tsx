import type { LocationDescriptorObject } from "history";
import type { PropsWithChildren } from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import * as Urls from "metabase/lib/urls";
import type { QueryParams } from "metabase/query_builder/actions";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

import { InteractiveQuestionProvider } from "./InteractiveQuestionProvider";

type InteractiveQuestionProviderProps = PropsWithChildren<{
  location: LocationDescriptorObject;
  params: QueryParams;
  componentPlugins?: SdkPluginsConfig;
  onReset?: () => void;
  onNavigateBack?: () => void;
}>;

export const InteractiveQuestionProviderWithLocation = ({
  location,
  params,
  ...props
}: InteractiveQuestionProviderProps) => {
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
