import { Box } from "metabase/ui";

import S from "./ErrorDetails.module.css";
import type { ErrorDetails } from "./types";

export const ErrorBox = ({ children }: { children: ErrorDetails }) => (
  <Box
    className={S.monospace}
    p="md"
    mt="sm"
    fw="bold"
    bg="background_page-secondary"
    mah="16rem"
  >
    {/* ensure we don't try to render anything except a string */}
    {typeof children === "string"
      ? children
      : typeof children.message === "string"
        ? children.message
        : String(children)}
  </Box>
);
