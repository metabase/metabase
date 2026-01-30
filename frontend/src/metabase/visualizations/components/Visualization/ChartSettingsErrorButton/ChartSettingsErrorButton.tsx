import type { ReactNode } from "react";

import { Button } from "metabase/common/components/Button";
import { Box } from "metabase/ui";
import type { VisualizationSettings } from "metabase-types/api";

interface ChartSettingsErrorButtonProps {
  message: ReactNode;
  buttonLabel: string;
  onClick: (initial: VisualizationSettings) => void;
}

function ChartSettingsErrorButton({
  message,
  buttonLabel,
  onClick,
}: ChartSettingsErrorButtonProps) {
  return (
    <div>
      <div>{message}</div>
      <Box mt="md">
        <Button primary medium onClick={onClick}>
          {buttonLabel}
        </Button>
      </Box>
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsErrorButton;
