import { t } from "ttag";

import {
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { AIProviderSetup } from "metabase/metabot";
import { useDispatch } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { Button, Flex, Text } from "metabase/ui";

import { skipAiConfig, submitAiConfig } from "../../actions";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

export const AIConfigStep = ({ stepLabel }: NumberedStepProps) => {
  const { isStepActive, isStepCompleted } = useStep("ai_config");
  const dispatch = useDispatch();

  const { data: connections = [], isLoading } = useListLlmProvidersQuery();
  const { data: providerTypes = [] } = useListLlmProviderTypesQuery();

  // The provider this step reports is the one Metabot actually landed on, not the first usable
  // connection: with several connected, the model picked in the picker decides.
  const modelRef = useSetting("llm-metabot-provider");
  const modelRefConnectionKey = modelRef?.split("/")[0];
  const connectedProvider = connections.find(
    (connection) =>
      connection.usable && connection.key === modelRefConnectionKey,
  );
  const connectedLabel = providerTypes.find(
    (providerType) => providerType.type === connectedProvider?.type,
  )?.label;

  const handleDone = () => {
    dispatch(submitAiConfig(connectedProvider?.type));
  };

  const handleSkip = () => {
    dispatch(skipAiConfig());
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle({
          connectedLabel,
          hasConnectedProvider: connectedProvider != null,
          isStepCompleted,
        })}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
      />
    );
  }

  return (
    <ActiveStep title={t`Connect to an AI provider`} label={stepLabel}>
      <Text mb="xl" c="text-secondary">
        {t`Select your AI provider to use AI explorations, SQL generation and Metabot.`}
      </Text>
      <AIProviderSetup onDone={handleDone} />
      {!isLoading && connectedProvider == null && (
        <Flex justify="end" mt="lg">
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
  hasConnectedProvider,
  isStepCompleted,
}: {
  connectedLabel: string | undefined;
  hasConnectedProvider: boolean;
  isStepCompleted: boolean;
}): string => {
  if (!isStepCompleted) {
    return t`Connect to an AI provider`;
  }
  if (!hasConnectedProvider) {
    return t`I'll set up AI later`;
  }
  // the label comes from a separate request, so a connected provider can briefly have no name
  return connectedLabel
    ? t`Connected to ${connectedLabel}`
    : t`Connected to an AI provider`;
};
