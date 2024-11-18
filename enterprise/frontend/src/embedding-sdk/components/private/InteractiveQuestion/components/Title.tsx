import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import type { PropsWithHTMLStyle } from "embedding-sdk/types/default-style-props";

import { useInteractiveQuestionContext } from "../context";

export const Title = ({ className, style }: PropsWithHTMLStyle) => {
  const { question } = useInteractiveQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
