import { forwardRef } from "react";

import { Button, Icon, type IconName } from "metabase/ui";

interface Props {
  disabled?: boolean;
  iconName: IconName;
  onClick: () => void;
}

// eslint-disable-next-line react/display-name
export const SectionAction = forwardRef<HTMLButtonElement, Props>(
  ({ disabled, iconName, onClick }, ref) => {
    return (
      <Button
        c="text-dark"
        disabled={disabled}
        h={32}
        variant="subtle"
        leftSection={<Icon name={iconName} />}
        ref={ref}
        w={32}
        onClick={onClick}
      />
    );
  },
);
