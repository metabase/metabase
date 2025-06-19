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
>((props) => <InteractiveQuestion {...props} />, {
  propertyNames: ["plugins"],
  propTypes: {
    questionId: "id",
  },
});

registerWebComponent("interactive-question", InteractiveQuestionWebComponent);
