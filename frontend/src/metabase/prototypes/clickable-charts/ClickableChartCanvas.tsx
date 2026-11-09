import { useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Group, Loader, Paper, Stack, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

import { QueryInspector } from "./harness/QueryInspector";
import { EXAMPLES } from "./harness/examples";
import { useOrdersQuery } from "./harness/useOrdersQuery";
import type { ChartDirection, Example } from "./types";

const STAGE_INDEX = 0;

type ClickableChartCanvasProps = {
  direction: ChartDirection;
};

/**
 * The shared harness: loads Sample Database → Orders, keeps the query and
 * display the direction edits, offers canned examples to reset to, and shows
 * the resulting query underneath.
 */
export function ClickableChartCanvas({ direction }: ClickableChartCanvasProps) {
  const { query: ordersQuery, isLoading, error } = useOrdersQuery();

  if (error) {
    return <Text c="feedback-negative">{error}</Text>;
  }
  if (isLoading || !ordersQuery) {
    return <Loader />;
  }
  return <LoadedCanvas direction={direction} ordersQuery={ordersQuery} />;
}

type LoadedCanvasProps = ClickableChartCanvasProps & {
  ordersQuery: Lib.Query;
};

function LoadedCanvas({ direction, ordersQuery }: LoadedCanvasProps) {
  const initialExample = direction.initialExample ?? EXAMPLES[0];
  const [query, setQuery] = useState(() =>
    initialExample.load(ordersQuery, STAGE_INDEX),
  );
  const [display, setDisplay] = useState(initialExample.display);
  const [settings, setSettings] = useState<VisualizationSettings>(
    initialExample.settings ?? {},
  );
  const [activeExample, setActiveExample] = useState<Example | undefined>(
    initialExample,
  );

  // Switching directions in the rail keeps this component mounted; start over.
  useEffect(() => {
    setQuery(initialExample.load(ordersQuery, STAGE_INDEX));
    setDisplay(initialExample.display);
    setSettings(initialExample.settings ?? {});
    setActiveExample(initialExample);
  }, [direction.id, initialExample, ordersQuery]);

  const handleChange = (
    nextQuery: Lib.Query,
    nextDisplay: CardDisplayType = display,
  ) => {
    setQuery(nextQuery);
    setDisplay(nextDisplay);
    // The example's settings were written for its chart type.
    if (nextDisplay !== display) {
      setSettings({});
    }
    setActiveExample(undefined);
  };

  const handleLoadExample = (example: Example) => {
    setQuery(example.load(ordersQuery, STAGE_INDEX));
    setDisplay(example.display);
    setSettings(example.settings ?? {});
    setActiveExample(example);
  };

  return (
    <Stack gap="md">
      <Group gap="xs">
        <Text size="sm" c="text-secondary">{t`Chart`}</Text>
        {EXAMPLES.map((example) => (
          <Button
            key={example.label}
            size="compact-sm"
            variant={example === activeExample ? "filled" : "default"}
            onClick={() => handleLoadExample(example)}
          >
            {example.label}
          </Button>
        ))}
      </Group>

      <Paper withBorder radius="md" p="lg">
        <direction.Component
          key={direction.id}
          query={query}
          stageIndex={STAGE_INDEX}
          display={display}
          settings={settings}
          onChange={handleChange}
        />
      </Paper>

      <QueryInspector query={query} />
    </Stack>
  );
}
