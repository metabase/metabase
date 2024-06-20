import TextArea from "metabase/core/components/TextArea";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { closeModal } from "metabase/redux/diagnostic";
import { Modal, Image, Text, Button, Flex, Box } from "metabase/ui";

export const DebugModal = () => {
  const modalOpen = useSelector(state => state.debug.modalOpen);
  const image = useSelector(state => state.debug.screenshot);

  const dispatch = useDispatch();

  const handleClose = () => {
    dispatch(closeModal());
  };

  return (
    <Modal
      opened={modalOpen}
      title="Send diagnostic info"
      size="xl"
      onClose={handleClose}
    >
      <Flex direction="column">
        <Text>Screenshot: </Text>
        <Image src={image} height={400} fit="contain" />

        <Text>Additional info to reproduce:</Text>
        <Box mb="1rem">
          <TextArea defaultValue={""}></TextArea>
        </Box>
        <Button>Send to Ryan to fix</Button>
      </Flex>
    </Modal>
  );
};
