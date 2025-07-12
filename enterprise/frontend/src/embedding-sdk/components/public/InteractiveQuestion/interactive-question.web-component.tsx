import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../metabase-provider.web-component";

import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "./InteractiveQuestion";

export type InteractiveQuestionWebComponentAttributes = {
  "question-id": string;
};

export type InteractiveQuestionWebComponentProps = Pick<
  InteractiveQuestionProps,
  "questionId" | "plugins"
>;

defineWebComponent<
  MetabaseProviderWebComponentContextProps &
    InteractiveQuestionWebComponentProps
>(
  "interactive-question",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <InteractiveQuestion {...props} />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
      questionId: "id",
      plugins: "json",
    },
  },
);
