import { QuestionEditor } from "embedding-sdk";
import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";

type CreateQuestionProps = Pick<InteractiveQuestionProps, "plugins">;

export const CreateQuestion = ({ plugins }: CreateQuestionProps = {}) => (
  <QuestionEditor plugins={plugins} />
);
