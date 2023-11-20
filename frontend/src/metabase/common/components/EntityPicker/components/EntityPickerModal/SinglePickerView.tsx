import { color } from "metabase/lib/colors";
import { Box } from "metabase/ui";

import type { EntityTab } from "../../types";

export const SinglePickerView = ({ tab }: { tab: EntityTab }) => {
  return (
    <Box
      style={{
        borderTop: `1px solid ${color("border")}`,
        flexGrow: 1,
        height: 0,
      }}
    >
      {tab.element}
    </Box>
  );
};
