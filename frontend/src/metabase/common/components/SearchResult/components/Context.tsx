// I think it's very likely that this is a dead codepath: RL 2023-06-21

import { Box, Text, rem } from "metabase/ui";

export function Context({ context }: { context: any[] }) {
  if (!context) {
    return null;
  }

  return (
    <Box ml={rem(42)} mt={rem(12)} maw={rem(620)}>
      <Text component="p" c="text-secondary" lh="lg">
        {context.map(({ is_match, text }, i: number) => {
          if (!is_match) {
            return <span key={i}> {text}</span>;
          }

          return (
            <Box component="strong" key={i} c="core-brand">
              {" "}
              {text}
            </Box>
          );
        })}
      </Text>
    </Box>
  );
}
