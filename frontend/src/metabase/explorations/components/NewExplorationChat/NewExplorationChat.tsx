import type { MetricOrMeasure } from "metabase/explorations/types";
import { MetabotChatEditor } from "metabase/metabot/components/MetabotChat/MetabotChatEditor";
import { Stack } from "metabase/ui";

import S from "./NewExplorationChat.module.css";

export interface NewExplorationChatProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  metrics: MetricOrMeasure[];
  setMetrics: (metrics: MetricOrMeasure[]) => void;
}

export function NewExplorationChat({
  prompt,
  setPrompt,
}: NewExplorationChatProps) {
  return (
    <Stack
      flex={1}
      bg="background-primary"
      bd="1px solid border"
      bdrs="md"
      pr="md"
      className={S.container}
    >
      <MetabotChatEditor
        value={prompt}
        onChange={setPrompt}
        onStop={() => {}}
        suggestionConfig={{ suggestionModels: ["metric", "measure"] }}
      />
    </Stack>
  );
}
