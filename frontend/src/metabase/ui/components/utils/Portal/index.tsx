import { Box, Portal as MantinePortal, type PortalProps } from "@mantine/core";
export { type PortalProps } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const Portal = ({ children, ...props }: PortalProps) => {
  return (
    <MantinePortal {...props}>
      <Box pos="absolute" className={ZIndex.Overlay}>
        {children}
      </Box>
    </MantinePortal>
  );
};
