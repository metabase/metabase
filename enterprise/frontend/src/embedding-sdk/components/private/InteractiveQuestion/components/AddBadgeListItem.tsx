import { Badge } from "@mantine/core";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Icon } from "metabase/ui";

type AddBadgeListItemProps = {
  name: string;
  onClick: () => void;
};

export const AddBadgeListItem = ({ name, onClick }: AddBadgeListItemProps) => (
  <Badge
    classNames={{
      root: CS.bgLightHover,
      inner: CS.cursorPointer,
    }}
    tt="capitalize"
    size="lg"
    variant="transparent"
    c="var(--mb-color-text-brand)"
    pr="sm"
    pl="xs"
    leftSection={
      <ActionIcon radius="xl" size="sm" mr="xs">
        <Icon name="add" c="var(--mb-color-text-brand)" size={10} />
      </ActionIcon>
    }
    onClick={onClick}
  >
    {name}
  </Badge>
);
