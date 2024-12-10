import { useState } from "react";

import { Button, Flex, Modal, type ModalProps, Text } from "metabase/ui";

const args = {
  centered: true,
  fullScreen: false,
  size: "md",
};

const argTypes = {
  centered: {
    control: { type: "boolean" },
  },
  fullScreen: {
    control: { type: "boolean" },
  },
  title: {
    control: { type: "text" },
  },
  size: {
    control: {
      type: "select",
      options: ["xs", "sm", "md", "lg", "xl", "auto"],
    },
  },
};

const SimpleWithTitleTemplate = (args: ModalProps) => {
  const [isOpen, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  return (
    <Flex justify="center">
      <Button variant="filled" onClick={handleOpen}>
        Open example
      </Button>
      <Modal
        title="Add to dashboard?"
        {...args}
        opened={isOpen}
        onClose={handleClose}
      >
        <Flex direction="row" justify="flex-end" mt="md">
          <Button type="submit" variant="filled" ml="sm">
            Add
          </Button>
        </Flex>
      </Modal>
    </Flex>
  );
};

const ConfirmationTemplate = (args: ModalProps) => {
  const [isOpen, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  return (
    <Flex justify="center">
      <Button variant="filled" onClick={handleOpen}>
        Open example
      </Button>
      <Modal
        title="Delete this database?"
        {...args}
        opened={isOpen}
        onClose={handleClose}
      >
        <Text>
          This cannot be undone, and questions that rely on this data will no
          longer work.
        </Text>
        <Flex direction="row" justify="flex-end" mt="md">
          <Button type="submit" ml="sm">
            Cancel
          </Button>
          <Button type="submit" variant="filled" color="error" ml="sm">
            Delete
          </Button>
        </Flex>
      </Modal>
    </Flex>
  );
};

const SingleButtonTemplate = (args: ModalProps) => {
  const [isOpen, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  return (
    <Flex justify="center">
      <Button variant="filled" onClick={handleOpen}>
        Open example
      </Button>
      <Modal
        title="Single button example"
        {...args}
        opened={isOpen}
        onClose={handleClose}
      >
        <Text>Sometimes all you need is one option.</Text>
        <Flex direction="row" justify="flex-end" mt="md">
          <Button type="submit" variant="filled" ml="sm">
            Add
          </Button>
        </Flex>
      </Modal>
    </Flex>
  );
};

const NoBodyTextTemplate = (args: ModalProps) => {
  const [isOpen, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  return (
    <Flex justify="center">
      <Button variant="filled" onClick={handleOpen}>
        Open example
      </Button>
      <Modal
        title="Saved! Add this to a dashboard?"
        {...args}
        opened={isOpen}
        onClose={handleClose}
      >
        <Flex direction="row" justify="flex-end" mt="md">
          <Button onClick={handleClose}>Not now</Button>
          <Button type="submit" variant="filled" ml="sm">
            Add
          </Button>
        </Flex>
      </Modal>
    </Flex>
  );
};

export default {
  title: "Overlays/Modal",
  component: Modal,
  args,
  argTypes,
};

export const SentenceCaseTitles = {
  render: SimpleWithTitleTemplate,
  name: "Sentence case titles",
};

export const Confirmation = {
  render: ConfirmationTemplate,
};

export const SingleButton = {
  render: SingleButtonTemplate,
  name: "Single button",
};

export const NoBodyText = {
  render: NoBodyTextTemplate,
  name: "No body text",
};
