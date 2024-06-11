import type React from "react";
import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { color } from "metabase/lib/colors";
import { Button, Tooltip } from "metabase/ui";

export const CommandPaletteTrigger = ({
  onClick,
}: {
  onClick: (e: React.MouseEvent) => void;
}) => {
  return (
    <Tooltip label={t`Search and quickly jump to things`}>
      <Button
        tabIndex={-1}
        onClick={onClick}
        p="0.25rem"
        bg={color("bg-light")}
        fw={700}
        fz="8pt"
        lh="8pt"
        mr="0.5rem"
        style={{
          borderRadius: "0.25rem",
          border: `1px solid ${color("border")}`,
        }}
        styles={{
          root: {
            "&:active": { transform: "none" },
            "&:hover": {
              color: color("text-dark"),
            },
          },
        }}
      >{`${METAKEY} + K `}</Button>
    </Tooltip>
  );
};
