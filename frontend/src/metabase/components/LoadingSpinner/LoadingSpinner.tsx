import { isReducedMotionPreferred } from "metabase/lib/dom";
import { Icon } from "metabase/ui";

import { SpinnerIcon, SpinnerRoot } from "./LoadingSpinner.styled";

interface Props {
  className?: string;
  size?: number;
  borderWidth?: number;
  "data-testid"?: string;
}

const BaseLoadingSpinner = ({
  className,
  size = 32,
  borderWidth = 4,
  "data-testid": dataTestId,
}: Props) => (
  <SpinnerRoot
    className={className}
    data-testid={dataTestId ?? "loading-spinner"}
  >
    {isReducedMotionPreferred() ? (
      <Icon name="hourglass" size="24" />
    ) : (
      <SpinnerIcon iconSize={size} borderWidth={borderWidth} />
    )}
  </SpinnerRoot>
);

/**
 * @deprecated: use Loader from "metabase/ui"
 */
const LoadingSpinner = Object.assign(BaseLoadingSpinner, {
  Root: SpinnerRoot,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingSpinner;
