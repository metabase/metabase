import { Group, Icon, UnstyledButton } from "metabase/ui";

import type { AnalysisMetabotPrompts } from "../metabot/use-analysis-metabot";

import S from "./SuggestedPrompts.module.css";

type SuggestedPromptsProps = {
  state: AnalysisMetabotPrompts;
};

/**
 * PROTOTYPE: questions to ask Metabot about the analysis. They wait for the
 * insights, since Metabot reads them and the first prompt comes from one.
 */
export const SuggestedPrompts = ({ state }: SuggestedPromptsProps) => {
  if (state.status === "loading") {
    return null;
  }

  return (
    <Group
      gap="xl"
      style={{ rowGap: "var(--mantine-spacing-sm)" }}
      justify="center"
      wrap="wrap"
      data-testid="analysis-suggested-prompts"
    >
      {state.prompts.map((prompt) => (
        <UnstyledButton
          key={prompt}
          className={S.chip}
          fz="md"
          onClick={() => state.onSubmit(prompt)}
        >
          <Group gap="sm" wrap="nowrap">
            <Icon name="metabot" className={S.icon} />
            {prompt}
          </Group>
        </UnstyledButton>
      ))}
    </Group>
  );
};
