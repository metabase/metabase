import { Badge } from "@mantine/core";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Icon } from "metabase/ui";

type BadgeListItemProps = {
  onSelectItem?: () => void;
  onRemoveItem?: () => void;
  name: string;
};

export const BadgeListItem = ({
  name,
  onRemoveItem,
  onSelectItem,
}: BadgeListItemProps) => (
  <Badge
    size="lg"
    tt="capitalize"
    variant="light"
    bg="var(--mb-color-brand-light)"
    c="var(--mb-color-text-brand)"
    classNames={{
      root: CS.bgLightHover,
      inner: CS.cursorPointer,
    }}
    onClick={onSelectItem}
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
  >
    {name}
  </Badge>
);
