import { QuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import { useSdkQuestionContext } from "embedding-sdk/components/private/SdkQuestion/context";
import type { CommonStylingProps } from "embedding-sdk/types/props";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type TitleProps = CommonStylingProps;

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
export const Title = ({ className, style }: TitleProps) => {
  const { question } = useSdkQuestionContext();

  return (
    question && (
      <QuestionTitle question={question} className={className} style={style} />
    )
  );
};
