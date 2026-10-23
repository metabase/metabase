import { t } from "ttag";

import {
  Button,
  Center,
  Flex,
  Icon,
  Loader,
  Modal,
  type ModalStepProps,
  Text,
} from "metabase/ui";

import type { UpgradeFlow } from "./types";

export function getUpgradeLoadingModalProps({
  flow,
  isSettingUp,
}: {
  flow: UpgradeFlow;
  isSettingUp: boolean;
}): ModalStepProps {
  const isTrial = flow === "trial";

  if (isSettingUp) {
    return {
      layout: "centered",
      title: isTrial
        ? t`Setting up your free trial, please wait`
        : // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Pro, only visible to admins
          t`Setting up Metabase Pro, please wait`,
      // Same size as the ready and error badges, so the modal keeps its height
      illustration: (
        <Center w={64} h={64}>
          <Loader size="xl" />
        </Center>
      ),
    };
  }

  return {
    layout: "centered",
    title: isTrial
      ? t`Your free trial is ready`
      : // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Pro, only visible to admins
        t`Metabase Pro is ready to use`,
    illustration: (
      <Flex
        align="center"
        justify="center"
        w={64}
        h={64}
        bg="feedback-positive"
        bdrs="50%"
      >
        <Icon name="check" c="core-white" size={32} />
      </Flex>
    ),
  };
}

interface UpgradeModalLoadingProps {
  isSettingUp: boolean;
  onDone: () => void;
}

export function UpgradeModalLoading({
  isSettingUp,
  onDone,
}: UpgradeModalLoadingProps) {
  return (
    <>
      <Text c="text-secondary">
        {isSettingUp
          ? t`This will take just a minute or so`
          : t`Happy exploring!`}
      </Text>
      <Modal.Footer>
        <Button
          variant="filled"
          color="brand"
          disabled={isSettingUp}
          onClick={() => {
            onDone();
            window.location.reload();
          }}
        >
          {t`Done`}
        </Button>
      </Modal.Footer>
    </>
  );
}
