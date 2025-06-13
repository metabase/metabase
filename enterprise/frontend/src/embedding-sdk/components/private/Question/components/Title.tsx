import { useQuestionContext } from "embedding-sdk/components/private/Question/context";
import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import type { CommonStylingProps } from "embedding-sdk/types/props";

/**
 * @interface
 * @expand
 * @category Question
 */
export type QuestionTitleProps = CommonStylingProps;

/**
 * Displays a title based on the question's state. Shows:
 *
 * - The question's display name if it's saved
 * - An auto-generated description for ad-hoc questions (non-native queries)
 * - "New question" as fallback or for new/native queries
 *
 * @function
 * @category Question
 * @param props
 */
export const Title = ({ className, style }: QuestionTitleProps) => {
  const { question } = useQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
