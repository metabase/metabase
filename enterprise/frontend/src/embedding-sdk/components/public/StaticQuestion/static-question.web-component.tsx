import { defineWebComponent } from "embedding-sdk/lib/web-components";

import { StaticQuestion, type StaticQuestionProps } from "../StaticQuestion";

export type StaticQuestionWebComponentAttributes = {
  "question-id": string;
};

export type StaticQuestionWebComponentProps = Pick<
  StaticQuestionProps,
  "questionId"
>;

defineWebComponent<StaticQuestionWebComponentProps>(
  "static-question",
  ({ container, slot, ...props }) => <StaticQuestion {...props} />,
  {
    propTypes: {
      questionId: "id",
    },
  },
);
