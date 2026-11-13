import { useState } from "react";

import { Box, Code, Collapse, Group, Icon, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";

type QueryInspectorProps = {
  query: Lib.Query;
};

/** The query as MBQL, collapsed; opens to show what an interaction wrote. */
export function QueryInspector({ query }: QueryInspectorProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Box>
      <UnstyledButton onClick={() => setIsOpened((opened) => !opened)}>
        <Group gap="xs" c="text-secondary" fz="sm">
          <Icon name={isOpened ? "chevrondown" : "chevronright"} size={12} />
          {Lib.suggestedName(query)}
        </Group>
      </UnstyledButton>
      <Collapse in={isOpened}>
        <Code block mt="xs" fz="xs">
          {JSON.stringify(Lib.toJsQuery(query), null, 2)}
        </Code>
      </Collapse>
    </Box>
  );
}
