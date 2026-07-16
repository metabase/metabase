import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import {
  AIProviderConfigurationForm,
  getProviderOptions,
  parseProviderAndModel,
} from "metabase/metabot";
import { PLUGIN_METABOT } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { Text } from "metabase/ui";
import type { MetabotProvider } from "metabase-types/api";

import { skipAiConfig, submitAiConfig } from "../../actions";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

export const AIConfigStep = ({ stepLabel }: NumberedStepProps) => {
  const { isStepActive, isStepCompleted } = useStep("ai_config");
  const dispatch = useDispatch();
  const offerMetabaseAiManaged = PLUGIN_METABOT.isEnabled;

  const isConfigured = !!useSetting("llm-metabot-configured?");
  const savedProviderValue = useSetting("llm-metabot-provider");
  const connectedProvider = isConfigured
    ? parseProviderAndModel(savedProviderValue)?.provider
    : undefined;

  const handleSubmit = (provider?: MetabotProvider) => {
    dispatch(submitAiConfig(provider ?? connectedProvider));
  };

  const handleSkip = () => {
    dispatch(skipAiConfig());
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle({
          connectedProvider,
          isStepCompleted,
          offerMetabaseAiManaged,
        })}
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
      <AIProviderConfigurationForm
        isModal
        defaultProvider={offerMetabaseAiManaged ? "metabase" : undefined}
        onClose={handleSubmit}
        onSkip={handleSkip}
      />
    </ActiveStep>
  );
};

const getStepTitle = ({
  connectedProvider,
  isStepCompleted,
  offerMetabaseAiManaged,
}: {
  connectedProvider: MetabotProvider | undefined;
  isStepCompleted: boolean;
  offerMetabaseAiManaged: boolean;
}): string => {
  if (!isStepCompleted) {
    return t`Connect to an AI provider`;
  }

  if (connectedProvider) {
    const providerLabel = getProviderOptions(offerMetabaseAiManaged)[
      connectedProvider
    ]?.label;
    return providerLabel
      ? t`Connected to ${providerLabel}`
      : t`AI provider connected`;
  }

  return t`I'll set up AI later`;
};
