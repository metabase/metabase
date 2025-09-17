import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Box, Button, Center, Flex, Icon, Modal } from "metabase/ui";

import { LibraryView } from "./LibraryView";

interface ViewLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ViewLibraryModal = ({
  isOpen,
  onClose,
}: ViewLibraryModalProps) => {
  const syncConfigured = useSetting("remote-sync-configured");

  return (
    <Modal.Root opened={isOpen} onClose={onClose} size="calc(100vw - 60px)">
      <Modal.Overlay />
      <Modal.Content h="100%">
        <Modal.Body h="100%" p={0}>
          {!syncConfigured ? (
            <Box h="100%">
              <Flex justify="center" align="center" h="100%">
                <Center>
                  <Button
                    leftSection={<Icon name="collection" />}
                    component={Link}
                    variant="filled"
                    to="/admin/settings/library"
                  >{t`Set up your library`}</Button>
                </Center>
              </Flex>
            </Box>
          ) : (
            <LibraryView />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
