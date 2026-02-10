import { Box, type BoxProps } from "metabase/ui";

type IconWrapperProps = BoxProps & {
  borderRadius?: number | string;
  children?: React.ReactNode;
};

export function IconWrapper({
  borderRadius = 6,
  children,
  style,
  ...boxProps
}: IconWrapperProps) {
  return (
    <Box
      display="flex"
      style={{
        justifyContent: "center",
        alignItems: "center",
        borderRadius,
        ...style,
      }}
      {...boxProps}
    >
      {children}
    </Box>
  );
}
