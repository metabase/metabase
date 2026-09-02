import type { StoryFn } from "@storybook/react";
import { Fragment, type ReactNode } from "react";

import {
  Box,
  Icon,
  NavLink,
  NavLinkBadge,
  NavLinkButton,
  type NavLinkProps,
  Stack,
  Text,
} from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

const LABEL = "Label";

type ContentColumn = {
  key: string;
  header: string;
  rightSection: ReactNode;
};

const COLUMNS: ContentColumn[] = [
  {
    key: "plain",
    header: `<NavLink leftSection={<Icon />} />`,
    rightSection: null,
  },
  {
    key: "icon",
    header: `<NavLink rightSection={<Icon />} />`,
    rightSection: <Icon name="chevronright" />,
  },
  {
    key: "button",
    header: `<NavLink rightSection={<NavLinkButton />} />`,
    rightSection: <NavLinkButton>Button</NavLinkButton>,
  },
  {
    key: "badge",
    header: `<NavLink rightSection={<NavLinkBadge />} />`,
    rightSection: <NavLinkBadge>3</NavLinkBadge>,
  },
];

type NavLinkState = {
  id: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
};

const STATES: NavLinkState[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "pressed", label: "Pressed" },
  { id: "selected", label: "Selected", active: true },
  { id: "disabled", label: "Disabled", disabled: true },
];

const VARIANTS = [
  { variant: "primary", title: "NavLink — primary" },
  { variant: "secondary", title: "NavLink — secondary" },
] as const;

const rowSelector = (id: string) => `[data-state-row="${id}"]`;

const PSEUDO_STATE_PARAMETERS = {
  pseudo: {
    hover: [rowSelector("hover")],
    active: [rowSelector("pressed")],
  },
};

type VariantMatrixProps = {
  variant: NavLinkProps["variant"];
  title: string;
};

function VariantMatrix({ variant, title }: VariantMatrixProps) {
  return (
    <StoryShowcase title={title}>
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: `10rem repeat(${COLUMNS.length}, minmax(13rem, max-content))`,
          columnGap: "2rem",
          rowGap: "0.75rem",
          alignItems: "center",
        }}
      >
        <div />
        {COLUMNS.map((column) => (
          <StoryJsx key={column.key}>{column.header}</StoryJsx>
        ))}

        {STATES.map((state) => (
          <Fragment key={state.id}>
            <Text size="sm" c="text-secondary">
              {state.label}
            </Text>
            {COLUMNS.map((column) => (
              <NavLink
                key={column.key}
                component="div"
                data-state-row={state.id}
                variant={variant}
                label={LABEL}
                leftSection={<Icon name="home" />}
                rightSection={column.rightSection}
                active={state.active ?? false}
                disabled={state.disabled ?? false}
              />
            ))}
          </Fragment>
        ))}
      </Box>
    </StoryShowcase>
  );
}

const OverviewTemplate: StoryFn<NavLinkProps> = () => (
  <Stack gap="xxl" align="flex-start">
    {VARIANTS.map(({ variant, title }) => (
      <VariantMatrix key={variant} variant={variant} title={title} />
    ))}
  </Stack>
);

const RIGHT_SECTIONS: Record<string, ReactNode> = {
  none: null,
  icon: <Icon name="chevronright" />,
  button: <NavLinkButton>Button</NavLinkButton>,
  badge: <NavLinkBadge>3</NavLinkBadge>,
};

const args: Partial<NavLinkProps> = {
  variant: "secondary",
  label: LABEL,
  active: false,
  disabled: false,
  leftSection: "icon",
  rightSection: "none",
};

const argTypes = {
  variant: {
    control: "inline-radio",
    options: ["secondary", "primary"],
  },
  leftSection: {
    control: "select",
    options: ["none", "icon"],
    mapping: {
      none: null,
      icon: <Icon name="home" />,
    },
  },
  rightSection: {
    control: "select",
    options: ["none", "icon", "button", "badge"],
    mapping: RIGHT_SECTIONS,
  },
  active: { control: "boolean" },
  disabled: { control: "boolean" },
};

export default {
  title: "Components/Navigation/NavLink",
  component: NavLink,
  args,
  argTypes,
};

export const Default = {};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    ...PSEUDO_STATE_PARAMETERS,
    controls: { include: [] },
  },
};
