import type { CSSProperties } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";

export const Title = ({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) => {
  const { question } = useInteractiveQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
