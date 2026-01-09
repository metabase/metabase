import { type HTMLAttributes, type Ref, forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Badge, type BadgeProps, Icon } from "metabase/ui";

type BadgeListItemRootProps = BadgeProps & HTMLAttributes<HTMLDivElement>;

interface AddBadgeListItemProps extends BadgeListItemRootProps {
  name: string;
}

const _AddBadgeListItem = (
  { name, ...rest }: AddBadgeListItemProps,
  ref: Ref<HTMLDivElement>,
) => (
  <Badge
    ref={ref}
    classNames={{
      label: CS.cursorPointer,
    }}
    bg="background-secondary"
    tt="capitalize"
    size="lg"
    variant="transparent"
    c="text-brand"
    pr="sm"
    pl="xs"
    leftSection={
      <ActionIcon radius="xl" size="sm" className={CS.bgMediumHover}>
        <Icon name="add" c="text-brand" size={10} />
      </ActionIcon>
    }
    {...rest}
  >
    {name}
  </Badge>
);

export const AddBadgeListItem = forwardRef(_AddBadgeListItem);
