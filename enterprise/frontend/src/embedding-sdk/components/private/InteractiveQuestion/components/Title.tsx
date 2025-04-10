import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import type { CommonElementProps } from "embedding-sdk/types/props";

/**
 * @interface
 * @category InteractiveQuestion
 */
export type InteractiveQuestionTitleProps = CommonElementProps;

/**
 * Displays a title based on the question's state. Shows:
 *
 * - The question's display name if it's saved
 * - An auto-generated description for ad-hoc questions (non-native queries)
 * - "New question" as fallback or for new/native queries
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const Title = ({ className, style }: InteractiveQuestionTitleProps) => {
  const { question } = useInteractiveQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
