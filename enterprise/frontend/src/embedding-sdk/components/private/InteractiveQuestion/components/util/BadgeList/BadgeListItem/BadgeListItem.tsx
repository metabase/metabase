import { Badge, type BadgeProps } from "@mantine/core";
import { type HTMLAttributes, type Ref, forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Icon } from "metabase/ui";

type BadgeListItemRootProps = BadgeProps & HTMLAttributes<HTMLDivElement>;

interface BadgeListItemProps extends BadgeListItemRootProps {
  onRemoveItem?: () => void;
  name: string;
}

const _BadgeListItem = (
  { name, onRemoveItem, ...rest }: BadgeListItemProps,
  ref: Ref<HTMLDivElement>,
) => (
  <Badge
    ref={ref}
    size="lg"
    tt="capitalize"
    variant="light"
    bg="var(--mb-color-brand-light)"
    c="var(--mb-color-text-brand)"
    classNames={{
      root: CS.bgLightHover,
      inner: CS.cursorPointer,
    }}
    pr={0}
    pl="sm"
    rightSection={
      <ActionIcon
        radius="xl"
        size="sm"
        ml={0}
        onClick={e => {
          e.stopPropagation();
          onRemoveItem?.();
        }}
        className={CS.bgMediumHover}
      >
        <Icon name="close" c="var(--mb-color-text-brand)" size={10} />
      </ActionIcon>
    }
    {...rest}
  >
    {name}
  </Badge>
);

export const BadgeListItem = forwardRef(_BadgeListItem);
