import type { ReactNode } from "react";

import { Button, Tooltip } from "metabase/ui";

import type { Example } from "../types";

type ExampleButtonProps = {
  example: Example;
  onLoad: (example: Example) => void;
  leftSection?: ReactNode;
};

/** Loads a canned query; the example's hint, when there is one, shows on hover. */
export function ExampleButton({
  example,
  onLoad,
  leftSection,
}: ExampleButtonProps) {
  return (
    <Tooltip
      label={example.hint}
      disabled={!example.hint}
      maw="24rem"
      multiline
      openDelay={300}
    >
      <Button
        size="sm"
        variant="default"
        leftSection={leftSection}
        onClick={() => onLoad(example)}
      >
        {example.label}
      </Button>
    </Tooltip>
  );
}
