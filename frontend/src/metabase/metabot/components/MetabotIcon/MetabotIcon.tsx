import { forwardRef } from "react";

import { useSetting } from "metabase/common/hooks";
import { useMetabotName } from "metabase/metabot/hooks";
import { Box, type BoxProps, Icon } from "metabase/ui";

export interface MetabotIconProps extends BoxProps {
  size?: number;
}

/**
 * Renders the metabot icon — either the default built-in SVG icon
 * or a custom uploaded image from the "metabot-icon" setting.
 */
export const MetabotIcon = forwardRef<HTMLImageElement, MetabotIconProps>(
  function MetabotIcon({ size = 16, ...rest }, ref) {
    const metabotIcon = useSetting("metabot-icon");
    const metabotName = useMetabotName();

    const isCustomIcon = metabotIcon && metabotIcon !== "metabot";

    if (isCustomIcon) {
      return (
        <Box
          component="img"
          ref={ref}
          src={metabotIcon}
          alt={metabotName}
          w={size}
          h={size}
          style={{ objectFit: "contain" }}
          {...rest}
        />
      );
    }

    return (
      <Box component="span" display="inline-flex" {...rest}>
        <Icon name="metabot" size={size} />
      </Box>
    );
  },
);
