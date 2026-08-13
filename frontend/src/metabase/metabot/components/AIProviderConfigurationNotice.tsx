import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useDispatch, useSelector } from "metabase/redux";
import { dismissUndo } from "metabase/redux/undo";
import { canAccessSettings } from "metabase/selectors/user";
import { Anchor, Flex, Text, type TextProps } from "metabase/ui";

import { useUserMetabotPermissions } from "../hooks";

import { AIProviderConfigurationModal } from "./AIProviderConfigurationModal";

export function AIProviderConfigurationNotice({
  featureName,
  onConfigureAi,
  inline,
  // Most call sites only render this notice after feature-access gating, so permission is already assumed
  hasFeatureAccess = true,
  ...rest
}: {
  featureName: string;
  onConfigureAi: () => void;
  inline?: boolean;
  hasFeatureAccess?: boolean;
} & TextProps) {
  const canConfigureAi = useSelector(canAccessSettings);
  const { isLoading: isLoadingPermissions } = useUserMetabotPermissions();

  if (isLoadingPermissions) {
    return null;
  }

  const content = match({ hasFeatureAccess, canConfigureAi })
    .with(
      { hasFeatureAccess: true, canConfigureAi: true },
      () =>
        jt`To use ${featureName}, please ${(
          <Anchor
            key="configure-ai-link"
            component="button"
            type="button"
            fz="inherit"
            inline
            onClick={onConfigureAi}
          >
            {t`connect to a model`}
          </Anchor>
        )}.`,
    )
    .with(
      { hasFeatureAccess: true },
      () => t`Ask your admin to connect to a model to use ${featureName}.`,
    )
    .otherwise(
      () =>
        t`You don't have permission to use ${featureName}. Please contact your admin for access.`,
    );
  return (
    <Text
      c="text-disabled"
      maw={!inline ? "16rem" : undefined}
      ta={!inline ? "center" : undefined}
      lh="lg"
      {...rest}
    >
      {content}
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

  const [isModalOpen, { close: closeModal, open: openModal }] = useDisclosure(
    false,
    { onClose: dismissToast },
  );

  return (
    <Flex direction="column" gap="xs">
      <AIProviderConfigurationNotice
        inline={true}
        onConfigureAi={openModal}
        featureName={featureName}
      />
      <AIProviderConfigurationModal opened={isModalOpen} onClose={closeModal} />
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
  icon: "metabot" as const,
  iconColor: "core-brand" as const,
  toastColor: "feedback-negative" as const,
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
