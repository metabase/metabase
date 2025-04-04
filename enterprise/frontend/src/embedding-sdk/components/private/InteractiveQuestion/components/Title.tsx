import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import type { CommonElementProps } from "embedding-sdk/types/props";

/**
 * @interface
 * @category InteractiveQuestion
 */
export type InteractiveQuestionTitleProps = CommonElementProps;

export const Title = ({ className, style }: InteractiveQuestionTitleProps) => {
  const { question } = useInteractiveQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
