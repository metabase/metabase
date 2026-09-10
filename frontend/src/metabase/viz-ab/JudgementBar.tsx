import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import type { VizJudgementVerdict } from "metabase/api";
import { Group, TextInput } from "metabase/ui";

import { VerdictButtons, type VerdictOption } from "./VerdictButtons";
import { VERDICT_KEYS, getVerdictLabel } from "./types";

type JudgementBarProps = {
  disabled: boolean;
  onSubmit: (verdict: VizJudgementVerdict, note: string) => void;
};

function getVerdictOptions(): VerdictOption<VizJudgementVerdict>[] {
  return Object.entries(VERDICT_KEYS).map(([hotkey, verdict]) => ({
    value: verdict,
    label: getVerdictLabel(verdict),
    hotkey,
    variant: verdict === "skip" ? "outline" : "filled",
  }));
}

export function JudgementBar({ disabled, onSubmit }: JudgementBarProps) {
  const [note, setNote] = useState("");
  const options = useMemo(getVerdictOptions, []);

  const submit = useCallback(
    (verdict: VizJudgementVerdict) => {
      onSubmit(verdict, note);
      setNote("");
    },
    [onSubmit, note],
  );

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <VerdictButtons options={options} disabled={disabled} onSelect={submit} />
      <TextInput
        placeholder={t`Optional note`}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        w={280}
      />
    </Group>
  );
}
