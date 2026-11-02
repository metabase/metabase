import type React from "react";
import { t } from "ttag";

import { Button, type ButtonProps, Icon, Tooltip } from "metabase/ui";

export const ResetButton = (buttonProps: ButtonProps): React.JSX.Element => (
  <Tooltip label={t`Reset view`}>
    <Button leftSection={<Icon name="revert" />} {...buttonProps} />
  </Tooltip>
);
