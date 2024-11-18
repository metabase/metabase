import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import type { PropsWithHTMLAttributes } from "embedding-sdk/types/default-style-props";

import { useInteractiveQuestionContext } from "../context";

export const Title = ({ className, style }: PropsWithHTMLAttributes) => {
  const { question } = useInteractiveQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
