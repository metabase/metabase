import { Box, Flex, Icon } from "metabase/ui";
import { isReducedMotionPreferred } from "metabase/utils/dom";

import S from "./LoadingSpinner.module.css";

export interface Props {
  className?: string;
  size?: number;
  borderWidth?: number;
  "data-testid"?: string;
}

/**
 * @deprecated: use Loader from "metabase/ui"
 */
export const LoadingSpinner = ({
  className,
  size = 32,
  borderWidth = 4,
  "data-testid": dataTestId,
}: Props) => (
  <Flex
    align="center"
    fz={0}
    className={className}
    data-testid={dataTestId ?? "loading-indicator"}
  >
    {isReducedMotionPreferred() ? (
      <Icon name="hourglass" size="24" />
    ) : (
      <Box
        display="inline-block"
        w={`${size}px`}
        h={`${size}px`}
        className={S.spinnerIcon}
        style={{ "--border-width": `${borderWidth}px` }}
      />
    )}
  </Flex>
);
