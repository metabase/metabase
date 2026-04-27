import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { dismissUndo } from "metabase/redux/undo";
import {
  Button,
  Flex,
  type FlexProps,
  HoverCard,
  Modal,
  Text,
} from "metabase/ui";

import { MetabotSetupInner } from "./MetabotAdmin/MetabotSetup";

const METABOT_MANAGED_PROVIDER_LIMIT_TOAST_ID =
  "metabot-managed-provider-limit";

type MetabotManagedProviderLimitActionsProps = {
  inline?: boolean;
  onConfigure?: VoidFunction;
  onConfigureClose?: VoidFunction;
} & FlexProps;

export const MetabotManagedProviderLimitActions = ({
  inline = false,
  onConfigure,
  onConfigureClose,
  ...rest
}: MetabotManagedProviderLimitActionsProps) => {
  const [isOpen, { open, close }] = useDisclosure(false, {
    onClose: onConfigureClose,
  });
  const handleConfigure = useCallback(() => {
    (onConfigure ?? open)();
  }, [onConfigure, open]);

  const configureModal = (
    <Modal
      title="Connect to an AI provider"
      onClose={close}
      opened={isOpen}
      size="lg"
    >
      <MetabotSetupInner isModal onClose={close} />
    </Modal>
  );

  const storeUrl = useStoreUrl("account/manage/plans");

  if (inline) {
    return (
      <Flex align="center" gap="sm" wrap="wrap" {...rest}>
        <Button
          h="1rem"
          variant="subtle"
          size="xs"
          fz="sm"
          p={0}
          onClick={handleConfigure}
        >
          {t`Use a different AI provider`}
        </Button>
        <Text span c="text-secondary" fz="sm" lh="1rem">
          •
        </Text>
        <Button
          h="1rem"
          component={ExternalLink}
          href={storeUrl}
          target="_blank"
          variant="subtle"
          size="xs"
          fz="sm"
          p={0}
        >
          {t`Start paid subscription`}
        </Button>
        {configureModal}
      </Flex>
    );
  }

  return (
    <Flex direction="column" align="start" gap="xs" {...rest}>
      <Button
        variant="subtle"
        size="xs"
        p={0}
        onClick={handleConfigure}
      >{t`Use a different AI provider`}</Button>
      <Button
        component={ExternalLink}
        href={storeUrl}
        target="_blank"
        variant="subtle"
        size="xs"
        p={0}
      >
        {t`Start paid subscription`}
      </Button>
      {configureModal}
    </Flex>
  );
};

export const MetabotManagedProviderLimitHoverCard = () => {
  return (
    <HoverCard
      closeDelay={100}
      openDelay={150}
      position="top-start"
      shadow="md"
      width="26rem"
    >
      <HoverCard.Target>
        <Text
          component="span"
          fz="sm"
          td="underline dotted"
          style={{ cursor: "pointer", textUnderlineOffset: "2px" }}
        >
          {t`You've run out of AI service tokens`}
        </Text>
      </HoverCard.Target>
      <HoverCard.Dropdown p="md">
        <Flex direction="column" gap="sm">
          <Text fz="sm" lh={1.5}>
            {t`You've used all of your included AI service tokens. To keep using AI features you can either end your trial early and start your subscription, or stay in the trial and add your own AI provider API key.`}
          </Text>
          <MetabotManagedProviderLimitActions inline />
        </Flex>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

const MetabotManagedProviderLimitToastContent = () => {
  const dispatch = useDispatch();

  const dismissToast = useCallback(() => {
    dispatch(dismissUndo({ undoId: METABOT_MANAGED_PROVIDER_LIMIT_TOAST_ID }));
  }, [dispatch]);

  return (
    <Flex direction="column" gap="xs">
      <Text c="text-primary" fw={500} lh={1.4}>
        {t`You've run out of AI service tokens`}
      </Text>
      <Text c="text-secondary" fz="sm" lh={1.4}>
        {t`You've used all of your included AI service tokens. To keep using AI features you can either end your trial early and start your subscription, or stay in the trial and add your own AI provider API key.`}
      </Text>
      <MetabotManagedProviderLimitActions
        inline
        mt="sm"
        onConfigureClose={dismissToast}
      />
    </Flex>
  );
};

export const getMetabotManagedProviderLimitToastProps = () => ({
  id: METABOT_MANAGED_PROVIDER_LIMIT_TOAST_ID,
  dark: false,
  icon: null,
  toastColor: "error",
  dismissIconColor: "text-secondary" as const,
  timeout: 0,
  style: {
    padding: "1rem",
    width: "min(24rem, calc(100vw - 2 * var(--mantine-spacing-md)))",
  },
  renderChildren: () => <MetabotManagedProviderLimitToastContent />,
});
