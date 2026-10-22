import { t } from "ttag";

import {
  Button,
  Flex,
  Icon,
  Modal,
  type ModalStepProps,
  Text,
} from "metabase/ui";

export const getUpgradeErrorModalProps = (): ModalStepProps => ({
  layout: "centered",
  title: t`Something went wrong`,
  illustration: (
    <Flex
      align="center"
      justify="center"
      w={64}
      h={64}
      bg="feedback-negative"
      bdrs="50%"
    >
      <Icon name="warning" c="core-white" size={32} />
    </Flex>
  ),
});

interface UpgradeModalErrorProps {
  onClose: () => void;
}

export function UpgradeModalError({ onClose }: UpgradeModalErrorProps) {
  return (
    <>
      <Text c="text-secondary">{t`Please try again later.`}</Text>
      <Modal.Footer>
        <Button variant="filled" color="brand" onClick={onClose}>
          {t`Close`}
        </Button>
      </Modal.Footer>
    </>
  );
}
