import { Link } from "react-router";
import { t } from "ttag";

import { useModalOpen } from "metabase/hooks/use-modal-open";
import { Button, Flex, Modal, Text } from "metabase/ui";

export const LegacyPermissionsModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  //Used to animate the modal
  const { open: showModal } = useModalOpen();
  return (
    <Modal.Root
      opened={isOpen && showModal}
      onClose={onClose}
      size="35rem"
      closeOnClickOutside={false}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="2.5rem" pb="1.5rem">
          <Modal.Title>{t`Permissions have been improved, but user access hasn't changed`}</Modal.Title>
        </Modal.Header>
        <Modal.Body p="2.5rem">
          <Text mb="1.5rem">
            In metabase 50, we updates out data permissions system to make it
            more expressive and easier. Your permissions have been automatically
            update to the new system. With some small differences, your groups
            will have the same level of access as before.
          </Text>
          <Flex justify="space-between">
            <Button
              variant="subtle"
              p={0}
              component={Link}
              to="https://www.metabase.com/docs/latest/permissions/no-self-service-deprecation"
              target="_blank"
            >
              Learn More
            </Button>
            <Button onClick={onClose} variant="filled">
              Gotcha
            </Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
