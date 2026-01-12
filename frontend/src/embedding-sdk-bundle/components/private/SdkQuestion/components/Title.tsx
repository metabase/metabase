import { QuestionTitle } from "embedding-sdk-bundle/components/private/QuestionTitle";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";

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
