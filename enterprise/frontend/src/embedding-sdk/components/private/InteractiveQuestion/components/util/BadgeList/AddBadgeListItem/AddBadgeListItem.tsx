import { Badge, type BadgeProps } from "@mantine/core";
import { type HTMLAttributes, type Ref, forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Icon } from "metabase/ui";

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
      inner: CS.cursorPointer,
    }}
    bg="var(--mb-color-bg-light)"
    tt="capitalize"
    size="lg"
    variant="transparent"
    c="var(--mb-color-text-brand)"
    pr="sm"
    pl="xs"
    leftSection={
      <ActionIcon radius="xl" size="sm" className={CS.bgMediumHover}>
        <Icon name="add" c="var(--mb-color-text-brand)" size={10} />
      </ActionIcon>
    }
    {...rest}
  >
    {name}
  </Badge>
);

export const AddBadgeListItem = forwardRef(_AddBadgeListItem);
