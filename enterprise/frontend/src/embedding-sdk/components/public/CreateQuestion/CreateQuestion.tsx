import { QuestionEditor } from "embedding-sdk/components/private/QuestionEditor";

import type { InteractiveQuestionProps } from "../InteractiveQuestion";

type CreateQuestionProps = Pick<InteractiveQuestionProps, "plugins">;

export const CreateQuestion = ({ plugins }: CreateQuestionProps = {}) => (
  <QuestionEditor plugins={plugins} />
);
