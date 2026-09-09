import { useEffect, useState } from "react";
import { t } from "ttag";

import type { VizJudgementVerdict } from "metabase/api";
import { Button, Group, Kbd, TextInput } from "metabase/ui";

import { VERDICT_KEYS, getVerdictLabel } from "./types";

type JudgementBarProps = {
  disabled: boolean;
  onSubmit: (verdict: VizJudgementVerdict, note: string) => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}

export function JudgementBar({ disabled, onSubmit }: JudgementBarProps) {
  const [note, setNote] = useState("");

  const submit = (verdict: VizJudgementVerdict) => {
    onSubmit(verdict, note);
    setNote("");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled || isTypingTarget(event.target)) {
        return;
      }
      const verdict = VERDICT_KEYS[event.key.toLowerCase()];
      if (verdict) {
        event.preventDefault();
        submit(verdict);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      {Object.entries(VERDICT_KEYS).map(([key, verdict]) => (
        <Button
          key={verdict}
          disabled={disabled}
          variant={verdict === "skip" ? "outline" : "filled"}
          onClick={() => submit(verdict)}
          rightSection={<Kbd size="xs">{key.toUpperCase()}</Kbd>}
        >
          {getVerdictLabel(verdict)}
        </Button>
      ))}
      <TextInput
        placeholder={t`Optional note`}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        w={280}
      />
    </Group>
  );
}
