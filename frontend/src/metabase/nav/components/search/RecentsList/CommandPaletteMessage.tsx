import { isMac } from "metabase/lib/browser";
import { color } from "metabase/lib/colors";
import { isWithinIframe } from "metabase/lib/dom";
import { Flex, Text } from "metabase/ui";

const METAKEY = isMac() ? "⌘" : "Ctrl";

export const CommandPaletteMessage = () =>
  isWithinIframe() ? null : (
    <Flex
      px="1rem"
      py=".5rem"
      gap=".5rem"
      align="center"
      bg="#f9fbfc"
      style={{
        borderBottomLeftRadius: ".5rem",
        borderBottomRightRadius: ".5rem",
        borderTop: "1px solid #f0f0f0",
      }}
    >
      <Text
        p="0.25rem"
        bg={color("bg-light")}
        fw={700}
        fz="8pt"
        lh="8pt"
        style={{
          borderRadius: "0.25rem",
          border: `1px solid ${color("border")}`,
        }}
      >{`${METAKEY} + K `}</Text>
      <Text size="sm" c={color("text-light")} fw={700} tt="uppercase">
        Open command palette
      </Text>
    </Flex>
  );
