import { Flex, type FlexProps } from "metabase/ui";
import { alpha } from "metabase/ui/colors";

type LargeIconContainerProps = FlexProps & {
  color: string;
  children: React.ReactNode;
};

/** A 4rem circle around a status icon, tinted with the icon's color. */
export const LargeIconContainer = ({
  color,
  style,
  ...props
}: LargeIconContainerProps) => (
  <Flex
    w="4rem"
    h="4rem"
    bdrs="50%"
    flex="0 0 auto"
    align="center"
    justify="center"
    style={{ ...style, color, backgroundColor: alpha(color, 0.15) }}
    {...props}
  />
);
