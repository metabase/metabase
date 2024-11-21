import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import type { FlexProps, IconName } from "metabase/ui";
import { Flex, Group, Icon } from "metabase/ui";

interface BaseBannerProps extends FlexProps {
  icon?: IconName;
  body: ReactNode;
}

type BannerProps =
  | (BaseBannerProps & { closable: true; onClose: () => void })
  | (BaseBannerProps & { closable?: false; onClose?: never });

export const Banner = ({
  icon,
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
      bg={bg || "bg-medium"}
      py="sm"
      justify="space-between"
      pl="1.325rem"
      pr="md"
      {...flexProps}
    >
      <Group spacing="xs">
        {icon && <Icon name={icon} w={36} />}
        {body}
      </Group>
      {closable && (
        <Icon
          className={CS.cursorPointer}
          name="close"
          onClick={onClose}
          w={36}
        />
      )}
    </Flex>
  );
};
