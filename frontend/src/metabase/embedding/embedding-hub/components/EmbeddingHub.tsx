import { useMemo } from "react";
import { t } from "ttag";

import { Box, Text, Title, rem } from "metabase/ui";

import { useCompletedEmbeddingHubSteps } from "../hooks";
import { getEmbeddingSteps } from "../utils";

import { EmbeddingChecklist } from "./EmbeddingChecklist";
import S from "./EmbeddingChecklist/EmbeddingChecklist.module.css";

export const EmbeddingHub = () => {
  const completedSteps = useCompletedEmbeddingHubSteps();
  const embeddingSteps = useMemo(() => getEmbeddingSteps(), []);

  // Find the first unchecked step to open by default
  const firstUncompletedStep = embeddingSteps.find(
    (step) => !completedSteps[step.id],
  );

  const defaultOpenStep = firstUncompletedStep?.id; // undefined means all collapsed if all completed

  return (
    <Box
      mih="100%"
      className={S.page}
      px={{ base: "md", md: "lg", lg: rem(48) }}
      pt="xl"
      pb={212}
    >
      <Box maw={592} m="0 auto">
        <Title order={1} mb="sm" c="text-dark">{t`Embedding hub`}</Title>

        <Text mb="xl" c="text-medium">
          {t`Get started with Embedded Analytics JS`}
        </Text>

        <EmbeddingChecklist
          steps={embeddingSteps}
          completedSteps={completedSteps}
          defaultOpenStep={defaultOpenStep}
          onStepChange={(_stepId) => {
            // Handle step change if needed (currently no-op)
          }}
        />
      </Box>
    </Box>
  );
};
