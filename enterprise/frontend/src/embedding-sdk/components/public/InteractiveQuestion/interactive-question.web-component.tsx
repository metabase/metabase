import { createWebComponent } from "embedding-sdk/lib/web-components/create-web-component";

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

customElements.define("interactive-question", InteractiveQuestionWebComponent);
