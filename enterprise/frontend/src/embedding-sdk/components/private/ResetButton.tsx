import type React from "react";
import { t } from "ttag";

import { Button, type ButtonProps, Icon, Tooltip } from "metabase/ui";

const sizeOverrideStyles = {
  width: 32,
  height: 32,
};

export const ResetButton = (buttonProps: ButtonProps): React.JSX.Element => (
  <Tooltip label={t`Reset view`}>
    <Button
      variant="outline"
      radius="xl"
      size="xs"
      leftSection={<Icon name="revert" />}
      style={sizeOverrideStyles}
      {...buttonProps}
    />
  </Tooltip>
);
