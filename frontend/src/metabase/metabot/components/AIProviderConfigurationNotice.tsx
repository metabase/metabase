import { useCallback } from "react";
import { jt, t } from "ttag";

import { dismissUndo } from "metabase/redux/undo";
import { canAccessSettings } from "metabase/selectors/user";
import { Anchor, Flex, Text, type TextProps } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";

import { useAiProviderConfigurationModal } from "../hooks";

export function AIProviderConfigurationNotice({
  featureName,
  onConfigureAi,
  inline,
  ...rest
}: {
  featureName: string;
  onConfigureAi: () => void;
  inline?: boolean;
} & TextProps) {
  const canConfigureAi = useSelector(canAccessSettings);

  return (
    <Text
      c="text-tertiary"
      maw={!inline ? "16rem" : undefined}
      ta={!inline ? "center" : undefined}
      lh="lg"
      {...rest}
    >
      {canConfigureAi
        ? jt`To use ${featureName}, please ${(
            <Anchor
              key="configure-ai-link"
              component="button"
              type="button"
              inline
              onClick={onConfigureAi}
            >
              {t`connect to a model`}
            </Anchor>
          )}.`
        : t`Ask your admin to connect to a model to use ${featureName}.`}
    </Text>
  );
}

const METABOT_NOT_CONFIGURED_TOAST_ID = "metabot-not-configured";

const MetabotNotConfiguredToastContent = ({
  featureName,
}: {
  featureName: string;
}) => {
  const dispatch = useDispatch();

  const dismissToast = useCallback(() => {
    dispatch(dismissUndo({ undoId: METABOT_NOT_CONFIGURED_TOAST_ID }));
  }, [dispatch]);

  const { aiProviderConfigurationModal, openAiProviderConfigurationModal } =
    useAiProviderConfigurationModal({ onClose: dismissToast });

  return (
    <Flex direction="column" gap="xs">
      <AIProviderConfigurationNotice
        inline={true}
        onConfigureAi={openAiProviderConfigurationModal}
        featureName={featureName}
      />
      {aiProviderConfigurationModal}
    </Flex>
  );
};

export const getMetabotNotConfiguredToastProps = ({
  featureName,
}: {
  featureName: string;
}) => ({
  id: METABOT_NOT_CONFIGURED_TOAST_ID,
  dark: false,
  icon: null,
  toastColor: "error",
  dismissIconColor: "text-secondary" as const,
  timeout: 0,
  style: {
    padding: "1rem",
    width: "min(24rem, calc(100vw - 2 * var(--mantine-spacing-md)))",
  },
  renderChildren: () => (
    <MetabotNotConfiguredToastContent featureName={featureName} />
  ),
});
