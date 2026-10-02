import type { StoryFn } from "@storybook/react";
import { Fragment, type ReactNode, useState } from "react";

import {
  Box,
  Button,
  Checkbox,
  Flex,
  MODAL_LAYOUTS,
  Modal,
  type ModalLayout,
  type ModalProps,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import {
  StoryJsx,
  StoryLabel,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

import S from "./Modal.module.css";
import { NO_ANIMATION_MODAL_PROPS } from "./constants";

const args = {
  centered: true,
  fullScreen: false,
  layout: "default",
  size: "md",
  withCloseButton: true,
};

const argTypes = {
  centered: {
    control: { type: "boolean" },
  },
  fullScreen: {
    control: { type: "boolean" },
  },
  layout: {
    options: MODAL_LAYOUTS,
    control: { type: "inline-radio" },
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
  withCloseButton: {
    control: { type: "boolean" },
  },
};

// Figma's placeholder is #D9D9D9 (light) / #5C666E (dark); border-neutral is the closest token
const IllustrationPlaceholder = () => (
  <Box w={96} h={96} bg="border-neutral" style={{ borderRadius: "50%" }} />
);

const InviteTeammateForm = ({ onCancel }: { onCancel?: () => void }) => (
  <form onSubmit={(event) => event.preventDefault()}>
    <Stack gap="md">
      <Text>{"They'll get an email with a link to set up their account."}</Text>
      <SimpleGrid cols={2} spacing="md">
        <TextInput label="First name" placeholder="Ada" />
        <TextInput label="Last name" placeholder="Lovelace" />
      </SimpleGrid>
      <TextInput label="Email" placeholder="ada@example.com" type="email" />
      <Select
        label="Group"
        data={["All Users", "Analysts", "Administrators"]}
        defaultValue="All Users"
      />
      <Textarea
        label="Message"
        description="Optional. Included in the invite email."
        placeholder="Welcome aboard!"
        minRows={3}
        autosize
      />
      <Checkbox label="Send a reminder if they haven't joined after a week" />
    </Stack>
    <Modal.Footer>
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="filled">
        Send invite
      </Button>
    </Modal.Footer>
  </form>
);

const WithFormTemplate = (args: ModalProps) => {
  const [isOpen, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  return (
    <Flex justify="center">
      <Button variant="filled" onClick={handleOpen}>
        Open example
      </Button>
      <Modal
        title="Invite a teammate"
        {...args}
        opened={isOpen}
        onClose={handleClose}
      >
        <InviteTeammateForm onCancel={handleClose} />
      </Modal>
    </Flex>
  );
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
        <Modal.Footer>
          <Button type="submit" variant="filled">
            Add
          </Button>
        </Modal.Footer>
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
        <Modal.Footer>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="filled" color="negative">
            Delete
          </Button>
        </Modal.Footer>
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
        <Modal.Footer>
          <Button type="submit" variant="filled">
            Add
          </Button>
        </Modal.Footer>
      </Modal>
    </Flex>
  );
};

const OpenedTemplate = (args: ModalProps) => (
  <Box w="100vw" h="100vh">
    <Modal {...args} title="Add to dashboard?" opened onClose={() => undefined}>
      <Text>Choose a dashboard for this question.</Text>
      <Modal.Footer>
        <Button type="submit" variant="filled">
          Add
        </Button>
      </Modal.Footer>
    </Modal>
  </Box>
);

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
        <Modal.Footer>
          <Button onClick={handleClose}>Not now</Button>
          <Button type="submit" variant="filled">
            Add
          </Button>
        </Modal.Footer>
      </Modal>
    </Flex>
  );
};

const CenteredTemplate = (args: ModalProps) => {
  const [isOpen, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  return (
    <Flex justify="center">
      <Button variant="filled" onClick={handleOpen}>
        Open example
      </Button>
      <Modal
        title="Your trial has started"
        illustration={<IllustrationPlaceholder />}
        {...args}
        layout="centered"
        opened={isOpen}
        onClose={handleClose}
      >
        <Text>You have 14 days to try out every feature.</Text>
        <Modal.Footer>
          <Button onClick={handleClose}>Maybe later</Button>
          <Button variant="filled">Get started</Button>
        </Modal.Footer>
      </Modal>
    </Flex>
  );
};

interface OverviewRow {
  id: string;
  label: string;
  title: string;
  body?: string;
  withCloseButton?: boolean;
  footer?: ReactNode;
  /** Replaces the body and footer, e.g. a form that wraps both */
  content?: ReactNode;
  /** Layouts to show the row in. Defaults to all of them */
  layouts?: readonly ModalLayout[];
  height?: number;
}

const PRIMARY_BUTTON = <Button variant="filled">Button</Button>;

const OVERVIEW_ROWS: readonly OverviewRow[] = [
  {
    id: "single-button",
    label: "One button",
    title: "Modal",
    body: "An accessible overlay dialog.",
    footer: PRIMARY_BUTTON,
  },
  {
    id: "two-buttons",
    label: "Two buttons",
    title: "Modal",
    body: "An accessible overlay dialog.",
    footer: (
      <>
        <Button>Cancel</Button>
        {PRIMARY_BUTTON}
      </>
    ),
  },
  {
    id: "close-hover",
    label: "Close button hover",
    title: "Modal",
    body: "An accessible overlay dialog.",
    footer: PRIMARY_BUTTON,
  },
  {
    id: "no-close-button",
    label: "No close button",
    title: "Modal",
    body: "An accessible overlay dialog.",
    withCloseButton: false,
    footer: PRIMARY_BUTTON,
  },
  {
    id: "no-body",
    label: "No body text",
    title: "Modal",
    footer: PRIMARY_BUTTON,
  },
  {
    id: "long-title",
    label: "Long title",
    title:
      "A much longer modal title that wraps onto a second line to show how it sits next to the close button",
    body: "An accessible overlay dialog.",
    footer: PRIMARY_BUTTON,
  },
  {
    id: "footer-message",
    label: "Footer message",
    title: "Modal",
    body: "An accessible overlay dialog.",
    footer: (
      <>
        <Text c="feedback-negative" flex={1}>
          Something went wrong
        </Text>
        <Button>Cancel</Button>
        {PRIMARY_BUTTON}
      </>
    ),
  },
  {
    id: "form",
    label: "Form",
    title: "Invite a teammate",
    content: <InviteTeammateForm />,
    layouts: ["default"],
    height: 680,
  },
];

const OVERVIEW_CELL_WIDTH = 480;
const OVERVIEW_CELL_HEIGHT = 480;

const OverviewCell = ({
  row,
  layout,
}: {
  row: OverviewRow;
  layout: ModalLayout;
}) => (
  // The transform makes the cell the containing block for the modal's
  // fixed-position wrapper, so each modal renders inside its own cell.
  <Box
    data-state-row={row.id}
    pos="relative"
    w={OVERVIEW_CELL_WIDTH}
    h={row.height ?? OVERVIEW_CELL_HEIGHT}
    style={{ transform: "translateZ(0)" }}
  >
    <Modal
      {...NO_ANIMATION_MODAL_PROPS}
      opened
      onClose={() => undefined}
      withinPortal={false}
      withOverlay={false}
      lockScroll={false}
      trapFocus={false}
      returnFocus={false}
      // The default offsets are viewport units, which would shrink the
      // modal inside its fixed-size cell as the window gets wider
      xOffset={0}
      yOffset={0}
      size={432}
      layout={layout}
      title={row.title}
      withCloseButton={row.withCloseButton ?? true}
      illustration={
        layout === "centered" ? <IllustrationPlaceholder /> : undefined
      }
    >
      {row.content ?? (
        <>
          {row.body && <Text>{row.body}</Text>}
          <Modal.Footer>{row.footer}</Modal.Footer>
        </>
      )}
    </Modal>
  </Box>
);

const OverviewTemplate: StoryFn<ModalProps> = () => (
  <StoryShowcase title="Modal">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `9rem repeat(${MODAL_LAYOUTS.length}, max-content)`,
        columnGap: "2rem",
        rowGap: "1rem",
        alignItems: "center",
      }}
    >
      <div />
      {MODAL_LAYOUTS.map((layout) => (
        <StoryJsx key={layout}>{`<Modal layout="${layout}" />`}</StoryJsx>
      ))}
      {OVERVIEW_ROWS.map((row) => (
        <Fragment key={row.id}>
          <StoryLabel>{row.label}</StoryLabel>
          {MODAL_LAYOUTS.map((layout) =>
            (row.layouts ?? MODAL_LAYOUTS).includes(layout) ? (
              <OverviewCell key={layout} row={row} layout={layout} />
            ) : (
              <StoryLabel key={layout}>
                Use the default layout for forms
              </StoryLabel>
            ),
          )}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

export default {
  title: "Components/Overlays/Modal",
  component: Modal,
  args,
  argTypes,
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      hover: [`[data-state-row="close-hover"] .${S.ModalCloseButton}`],
    },
    controls: { include: ["theme"] },
  },
};

export const SentenceCaseTitles = {
  render: SimpleWithTitleTemplate,
  name: "Sentence case titles",
};

export const Confirmation = {
  render: ConfirmationTemplate,
};

export const WithForm = {
  render: WithFormTemplate,
  name: "With form",
};

export const Centered = {
  render: CenteredTemplate,
};

export const Opened = {
  render: OpenedTemplate,
};

export const SingleButton = {
  render: SingleButtonTemplate,
  name: "Single button",
};

export const NoBodyText = {
  render: NoBodyTextTemplate,
  name: "No body text",
};
