/* eslint-disable*/

/* Hacking in some styling, TODO - remove this */

import { ActionIcon } from "@mantine/core";
import { color } from "metabase/lib/colors";
import { Box, Flex, Icon } from "metabase/ui";

export function VisualizerMenuItem({
  item,
  onClick,
}: {
  item: any;
  onClick: (item: any) => void;
}) {
  return (
    <Flex
      align="center"
      sx={{
        ".Icon": {
          opacity: "0",
        },
        ":hover": {
          backgroundColor: color("brand-lighter"),
          color: color("brand"),
          borderRadius: "4px",
          cursor: "pointer",

          ".Icon": {
            opacity: "1",
          },
        },
      }}
      onClick={() => onClick(item)}
    >
      <Box py="sm" px="md">
        {item.displayName || item.name}
      </Box>
      {/* TODO - Only show this if the item is addable */}
      <ActionIcon ml="auto">
        <Icon
          name="add"
          style={{ borderLeft: `1px solid ${color("brand-lighter")}` }}
        />
      </ActionIcon>
    </Flex>
  );
}
