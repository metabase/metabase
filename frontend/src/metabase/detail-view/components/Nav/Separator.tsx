import { Box } from "metabase/ui";

export const Separator = () => (
  <Box
    c="text-disabled"
    flex="0 0 auto"
    fw="bold"
    fz="0.8em"
    style={{ userSelect: "none" }}
  >
    /
  </Box>
);
