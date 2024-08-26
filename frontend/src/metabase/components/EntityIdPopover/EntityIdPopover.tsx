import { useTimeout } from "@mantine/hooks";
import { useState } from "react";

import {
  ActionIcon,
  Box,
  Button,
  Icon,
  Popover,
  Stack,
  Text,
} from "metabase/ui";
import type { BaseEntityId, CardId, DashboardId } from "metabase-types/api";

export const EntityIdPopover = ({
  resource: { entity_id, name },
}: {
  resource: {
    id: CardId | DashboardId;
    name: string;
    entity_id: BaseEntityId;
  };
}) => {
  const [buttonState, setButtonState] = useState("default");
  const { start } = useTimeout(() => setButtonState("default"), 1500);

  const onCopy = async (value: string) => {
    setButtonState("filled");
    start();
    await navigator.clipboard.writeText(value);
  };

  return (
    <Popover>
      <Popover.Target>
        <ActionIcon>
          <Icon name="document" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack p="md">
          <Box>
            <Text fw="bold" fz="lg">
              {name}
            </Text>
            <Text italic fz="md" fw="semibold">
              ID: {entity_id}
            </Text>
          </Box>
          <Button onClick={() => onCopy(entity_id)} variant={buttonState}>
            {buttonState === "filled" ? "Copied!" : "Click to copy ID"}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
