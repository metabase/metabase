import { t } from "ttag";

import { Code, Stack, Text, Title } from "metabase/ui";

const REGISTRY_PATH = "frontend/src/metabase/prototypes/registry.ts";

type BlankCanvasProps = {
  title: string;
};

/** Placeholder content for a prototype that has nothing in it yet. */
export function BlankCanvas({ title }: BlankCanvasProps) {
  return (
    <Stack gap="sm" maw={640}>
      <Title order={3}>{title}</Title>
      <Text c="text-secondary">
        {t`Nothing here yet. Add a component under the canvases folder and register it to get a tab in the rail.`}
      </Text>
      <Code block>{REGISTRY_PATH}</Code>
    </Stack>
  );
}
