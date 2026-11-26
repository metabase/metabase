import { useEffect } from "react";

import { useLocation, useNavigate } from "metabase/router";
import { Button, Group, Text, Tooltip } from "metabase/ui";

import { EXAMPLES, type MetricExample } from "./examples";

export const EXAMPLE_PARAM_PREFIX = "example-";

/** The example in `?metric=example-<id>`, defaulting to the first one. */
export function useExampleParam(): {
  example: MetricExample;
  select: (id: string) => void;
} {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const param = new URLSearchParams(search).get("metric");
  const example = EXAMPLES.find(
    ({ id }) => `${EXAMPLE_PARAM_PREFIX}${id}` === param,
  );

  useEffect(() => {
    if (example == null) {
      navigate(`${pathname}?metric=${EXAMPLE_PARAM_PREFIX}${EXAMPLES[0].id}`, {
        replace: true,
      });
    }
  }, [example, pathname, navigate]);

  return {
    example: example ?? EXAMPLES[0],
    select: (id) => navigate(`${pathname}?metric=${EXAMPLE_PARAM_PREFIX}${id}`),
  };
}

/** The example metrics, as buttons: the same bar in every prototype. */
export function ExamplesBar({
  activeId,
  onSelect,
}: {
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <Group gap="sm">
      <Text fw="bold" c="text-secondary">
        Examples
      </Text>
      {EXAMPLES.map((candidate) => (
        <Tooltip
          key={candidate.id}
          label={candidate.hint}
          maw="24rem"
          multiline
          openDelay={300}
        >
          <Button
            size="sm"
            variant={candidate.id === activeId ? "filled" : "default"}
            onClick={() => onSelect(candidate.id)}
          >
            {candidate.name}
          </Button>
        </Tooltip>
      ))}
    </Group>
  );
}
