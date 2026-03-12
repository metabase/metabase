import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors/types";
import type { FlexProps, IconName } from "metabase/ui";
import { Flex, Group, Icon } from "metabase/ui";

interface BaseBannerProps extends FlexProps {
  icon?: IconName;
  iconColor?: ColorName;
  body: ReactNode;
}

export type BannerProps =
  | (BaseBannerProps & { closable: true; onClose: () => void })
  | (BaseBannerProps & { closable?: false; onClose?: never });

export const Banner = ({
  icon,
  iconColor,
  body,
  closable,
  onClose,
  bg,
  ...flexProps
}: BannerProps) => {
  return (
    <Flex
      data-testid="app-banner"
      align="center"
      bg={bg || "background-tertiary"}
      py="sm"
      justify="space-between"
      pl="1.325rem"
      pr="md"
      {...flexProps}
    >
      <Group gap="xs">
        {icon && <Icon name={icon} w={36} c={iconColor} />}
        {body}
      </Group>
      {closable && (
        <Icon
          className={CS.cursorPointer}
          name="close"
          onClick={onClose}
          w={36}
          c={iconColor}
        />
      )}
    </Flex>
  );
};
