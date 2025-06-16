import { t } from "ttag";

import { Box, Flex } from "metabase/ui";

import {
  EmbeddingSetupProvider,
  useEmbeddingSetup,
} from "./EmbeddingSetupContext";
import { EmbeddingSetupSidebar } from "./EmbeddingSetupSidebar";

const EmbeddingSetupInner = () => {
  const {
    stepKey,
    goToStep,
    stepIndex,
    totalSteps,
    goToNextStep,
    StepComponent,
  } = useEmbeddingSetup();

  return (
    <Flex
      justify="center"
      style={{
        minHeight: "100vh",
        alignItems: "start",
        width: "100%",
      }}
    >
      <Flex h="100vh" style={{ position: "sticky", top: 0 }}>
        <EmbeddingSetupSidebar />
      </Flex>
      <Box
        component="section"
        aria-label={t`Embedding setup current step`}
        p="xl"
        flex={1}
        maw="53rem"
      >
        <Box
          p="xl"
          flex={1}
          bg="bg-white"
          bd="1px solid var(--mb-color-border)"
          w="100%"
          style={{ borderRadius: "0.5rem" }}
        >
          <StepComponent
            nextStep={goToNextStep}
            goToStep={goToStep}
            stepKey={stepKey}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
          />
        </Box>
      </Box>
    </Flex>
  );
};

export const EmbeddingSetup = () => (
  <EmbeddingSetupProvider>
    <EmbeddingSetupInner />
  </EmbeddingSetupProvider>
);
