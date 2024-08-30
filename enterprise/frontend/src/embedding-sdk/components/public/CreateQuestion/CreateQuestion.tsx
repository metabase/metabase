import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type CreateQuestionProps = Pick<
  InteractiveQuestionProps,
  "plugins" | "enableSave"
>;

export const CreateQuestion = ({
  plugins,
  enableSave,
}: CreateQuestionProps = {}) => (
  <QuestionEditor plugins={plugins} enableSave={enableSave} />
);
