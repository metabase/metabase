import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

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

const InteractiveQuestionWebComponent =
  createWebComponent<InteractiveQuestionWebComponentProps>(
    ({ container, slot, ...props }) => <InteractiveQuestion {...props} />,
    {
      propTypes: {
        questionId: "id",
        plugins: "json",
      },
    },
  );

registerWebComponent("interactive-question", InteractiveQuestionWebComponent);
