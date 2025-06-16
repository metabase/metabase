import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "./InteractiveQuestion";

export type InteractiveQuestionWebComponentAttributes = {
  "question-id": InteractiveQuestionProps["questionId"];
};

const InteractiveQuestionWebComponent = createWebComponent<
  Pick<InteractiveQuestionProps, "questionId">
>(({ questionId }) => <InteractiveQuestion questionId={questionId} />, {
  props: {
    questionId: "number",
  },
});

registerWebComponent("interactive-question", InteractiveQuestionWebComponent);
