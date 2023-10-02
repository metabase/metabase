import { isReducedMotionPreferred } from "metabase/lib/dom";

import { Icon } from "metabase/core/components/Icon";
import type { LoaderProps } from "metabase/ui";
import { Center } from "metabase/ui";
import { StyledLoader, SpinnerRoot } from "./LoadingSpinner.styled";

type Props = {
  className?: string;
  borderWidth?: number;
  "data-testid"?: string;
} & LoaderProps;

const BaseLoadingSpinner = ({
  className,
  size = 32,
  color = "brand.1",
  "data-testid": dataTestId,
  ...loaderProps
}: Props) => (
  <Center className={className} data-testid={dataTestId ?? "loading-spinner"}>
    {isReducedMotionPreferred() ? (
      <Icon name="hourglass" size="24" />
    ) : (
      <StyledLoader {...loaderProps} c={color} size={size} />
    )}
  </Center>
);

/**
 * @deprecated: use Loader from "metabase/ui"
 */
const LoadingSpinner = Object.assign(BaseLoadingSpinner, {
  Root: SpinnerRoot,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingSpinner;
