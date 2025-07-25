import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import { StaticQuestion, type StaticQuestionProps } from "../StaticQuestion";
import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../metabase-provider.web-component";

export type StaticQuestionWebComponentAttributes = {
  "question-id": string;
};

export type StaticQuestionWebComponentProps = Pick<
  StaticQuestionProps,
  "questionId"
>;

defineWebComponent<
  MetabaseProviderWebComponentContextProps & StaticQuestionWebComponentProps
>(
  "static-question",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <StaticQuestion {...props} />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
      questionId: "id",
    },
  },
);
