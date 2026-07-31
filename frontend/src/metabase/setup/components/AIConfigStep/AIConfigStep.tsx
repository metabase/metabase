import { t } from "ttag";

import {
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { AIProviderSetup } from "metabase/metabot";
import { useDispatch } from "metabase/redux";
import { Button, Flex, Text } from "metabase/ui";

import { skipAiConfig, submitAiConfig } from "../../actions";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

export const AIConfigStep = ({ stepLabel }: NumberedStepProps) => {
  const { isStepActive, isStepCompleted } = useStep("ai_config");
  const dispatch = useDispatch();

  const { data: connections = [] } = useListLlmProvidersQuery();
  const { data: providerTypes = [] } = useListLlmProviderTypesQuery();

  const connection = connections[0];
  const connectedLabel = providerTypes.find(
    (providerType) => providerType.type === connection?.type,
  )?.label;

  const handleDone = () => {
    dispatch(submitAiConfig(connection?.type));
  };

  const handleSkip = () => {
    dispatch(skipAiConfig());
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle({ connectedLabel, isStepCompleted })}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
      />
    );
  }

  return (
    <ActiveStep title={t`Connect to an AI provider`} label={stepLabel}>
      <Text mb="lg" c="text-secondary">
        {t`Select your AI provider to use AI explorations, SQL generation and Metabot.`}
      </Text>
      <AIProviderSetup onDone={handleDone} />
      {connection == null && (
        <Flex justify="end" mt="md">
          <Button variant="subtle" onClick={handleSkip}>
            {t`I'll set this up later`}
          </Button>
        </Flex>
      )}
    </ActiveStep>
  );
};

const getStepTitle = ({
  connectedLabel,
  isStepCompleted,
}: {
  connectedLabel: string | undefined;
  isStepCompleted: boolean;
}): string => {
  if (!isStepCompleted) {
    return t`Connect to an AI provider`;
  }
  return connectedLabel
    ? t`Connected to ${connectedLabel}`
    : t`I'll set up AI later`;
};
