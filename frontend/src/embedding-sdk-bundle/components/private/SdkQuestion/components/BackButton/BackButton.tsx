import { SdkInternalNavigationBackButton } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationBackButton";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type BackButtonProps = {
  style?: React.CSSProperties;
  className?: string;
};

/**
 * A navigation button that allows users to go back to the previous view.
 * Visible after performing navigations such as drills or click behaviors.
 *
 * Displays "Back to {name}" where name is the title of the previous dashboard or question.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const BackButton = (props: BackButtonProps) => {
  return <SdkInternalNavigationBackButton {...props} />;
};
