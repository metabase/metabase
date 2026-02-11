import { type HTMLAttributes, type Ref, forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Badge, type BadgeProps, Icon } from "metabase/ui";

import S from "./BadgeListItem.module.css";

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
    classNames={{
      root: S.BadgeListItem,
      label: CS.cursorPointer,
    }}
    pr={0}
    pl="sm"
    rightSection={
      <ActionIcon
        radius="xl"
        size="sm"
        ml={0}
        onClick={(e) => {
          e.stopPropagation();
          onRemoveItem?.();
        }}
        className={S.BadgeListRemoveButton}
        data-testid="badge-remove-button"
      >
        <Icon name="close" c="text-brand" size={10} />
      </ActionIcon>
    }
    {...rest}
  >
    {name}
  </Badge>
);

export const BadgeListItem = forwardRef(_BadgeListItem);
