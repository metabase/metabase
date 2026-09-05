import { within } from "@storybook/test";
import { Fragment } from "react";

import { Badge, Box, Group, Icon, KeyboardShortcut, Stack } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StoryLabel,
  StorySection,
} from "metabase/ui/stories/showcase";

import { Button, type ButtonProps } from "./";

const args = {
  variant: "default",
  color: undefined,
  size: "md",
  disabled: false,
  fullWidth: false,
  radius: "sm",
  loading: false,
};

const argTypes = {
  variant: {
    options: [
      "default",
      "filled",
      "light",
      "subtle",
      "transparent",
      "outline",
      "inverse",
    ],
    control: { type: "inline-radio" },
  },
  color: {
    options: {
      default: undefined,
      "feedback-positive": "feedback-positive",
      "feedback-negative": "feedback-negative",
    },
    control: { type: "inline-radio" },
  },
  size: {
    control: {
      type: "select",
      options: [
        "xs",
        "sm",
        "md",
        "lg",
        "xl",
        "compact-xs",
        "compact-sm",
        "compact-md",
        "compact-lg",
        "compact-xl",
      ],
    },
  },
  disabled: {
    control: { type: "boolean" },
  },
  fullWidth: {
    control: { type: "boolean" },
  },
  radius: {
    options: ["sm", "md", "xl"],
    control: { type: "inline-radio" },
  },
  loading: {
    control: { type: "boolean" },
  },
  loaderPosition: {
    options: ["left", "right"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = (args: ButtonProps) => (
  <Button {...args}>Button</Button>
);

const ButtonGroupTemplate = (args: ButtonProps) => (
  <Button.Group>
    <Button {...args}>One</Button>
    <Button {...args}>Two</Button>
    <Button {...args}>Three</Button>
  </Button.Group>
);

const GridRow = (args: ButtonProps) => (
  <Group wrap="nowrap">
    <Button {...args}>Save</Button>
    <Button {...args} leftSection={<Icon name="add" />}>
      New
    </Button>
    <Button {...args} rightSection={<Icon name="chevrondown" />}>
      Category
    </Button>
    <Button {...args} leftSection={<Icon name="play" />} />
  </Group>
);

const GridRowGroup = (args: ButtonProps) => (
  <Fragment>
    <GridRow {...args} />
    <GridRow {...args} radius="xl" />
  </Fragment>
);

const GridTemplate = (args: ButtonProps) => (
  <Stack>
    <GridRowGroup {...args} variant="filled" />
    <GridRowGroup {...args} variant="outline" />
    <GridRowGroup {...args} variant="default" />
    <GridRow {...args} variant="subtle" />
    <GridRow {...args} variant="inverse" />
  </Stack>
);

const LoadingGridRow = (args: ButtonProps) => (
  <Group wrap="nowrap">
    <Button {...args}>Save</Button>
    <Button {...args}>Save</Button>
    <Button {...args} leftSection={<Icon name="play" />} />
  </Group>
);

const LoadingGridRowGroup = (args: ButtonProps) => (
  <Fragment>
    <LoadingGridRow {...args} />
    <LoadingGridRow {...args} radius="xl" />
  </Fragment>
);

const LoadingGridTemplate = (args: ButtonProps) => (
  <Stack>
    <LoadingGridRowGroup {...args} variant="filled" />
    <LoadingGridRowGroup {...args} variant="outline" />
    <LoadingGridRowGroup {...args} variant="default" />
    <LoadingGridRow {...args} variant="subtle" />
    <LoadingGridRow {...args} variant="inverse" />
  </Stack>
);

export default {
  title: "Components/Buttons/Button",
  component: Button,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const ButtonGroup = {
  render: ButtonGroupTemplate,
  name: "Button group",
};

export const DefaultSize = {
  render: GridTemplate,
  name: "Default size",
};

export const DefaultSizeCustomColor = {
  render: GridTemplate,
  name: "Default size, custom color",
  args: {
    color: "feedback-negative",
  },
};

export const DefaultSizeDisabled = {
  render: GridTemplate,
  name: "Default size, disabled",
  args: {
    disabled: true,
  },
};

export const DefaultSizeLoading = {
  render: LoadingGridTemplate,
  name: "Default size, loading",
  args: {
    loading: true,
  },
};

export const DefaultSizeFullWidth = {
  render: GridTemplate,
  name: "Default size, full width",
  args: {
    fullWidth: true,
  },
};

export const DefaultSizeFullWidthDisabled = {
  render: GridTemplate,
  name: "Default size, full width, disabled",
  args: {
    disabled: true,
    fullWidth: true,
  },
};

export const DefaultSizeFullWidthLoading = {
  render: LoadingGridTemplate,
  name: "Default size, full width, loading",
  args: {
    loading: true,
    fullWidth: true,
  },
};

export const CompactSize = {
  render: GridTemplate,
  name: "Compact size",
  args: {
    size: "compact-md",
  },
};

export const CompactSizeCustomColor = {
  render: GridTemplate,
  name: "Compact size, custom color",
  args: {
    color: "feedback-negative",
    size: "compact-md",
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const button = (
      await canvas.findAllByRole("button", {
        name: "Save",
      })
    )[0];
    button.classList.add("pseudo-hover");
  },
};

export const CompactSizeDisabled = {
  render: GridTemplate,
  name: "Compact size, disabled",
  args: {
    size: "compact-md",
    disabled: true,
  },
};

export const CompactSizeLoading = {
  render: LoadingGridTemplate,
  name: "Compact size, loading",
  args: {
    size: "compact-md",
    loading: true,
  },
};

export const CompactSizeFullWidth = {
  render: GridTemplate,
  name: "Compact size, full width",
  args: {
    size: "compact-md",
    fullWidth: true,
  },
};

export const CompactSizeFullWidthDisabled = {
  render: GridTemplate,
  name: "Compact size, full width, disabled",
  args: {
    size: "compact-md",
    disabled: true,
    fullWidth: true,
  },
};

export const CompactSizeFullWidthLoading = {
  render: LoadingGridTemplate,
  name: "Compact size, full width, loading",
  args: {
    size: "compact-md",
    loading: true,
    fullWidth: true,
  },
};

const MATRIX_SIZES = ["md", "sm", "lg"] as const;
const COMPACT_SIZES = ["compact-md", "compact-sm"] as const;
const MATRIX_STATES = [
  "default",
  "hover",
  "active",
  "disabled",
  "loading",
] as const;

const MATRIX_COLORS = {
  brand: "core-brand",
  negative: "feedback-negative",
  neutral: "text-primary",
} as const;

const COLOR_TITLES: Record<MatrixColor, string> = {
  brand: "Brand",
  negative: "Negative",
  neutral: "Neutral",
};

const STATE_LABELS: Record<MatrixState, string> = {
  default: "default",
  hover: "hover",
  active: "pressed",
  disabled: "disabled",
  loading: "loading",
};

type MatrixSize = (typeof MATRIX_SIZES | typeof COMPACT_SIZES)[number];
type MatrixState = (typeof MATRIX_STATES)[number];
type MatrixColor = keyof typeof MATRIX_COLORS;

const matrixStateProps = (
  state: MatrixState,
): { disabled?: boolean; loading?: boolean } => {
  if (state === "disabled") {
    return { disabled: true };
  }
  if (state === "loading") {
    return { loading: true };
  }
  return {};
};

const matrixCell = (variant: string, color: MatrixColor, size: MatrixSize) =>
  `${color === "brand" ? variant : `${variant}-${color}`}/${size}`;

const matrixJsx = (variant: string, color: MatrixColor) =>
  color === "brand"
    ? `<Button variant="${variant}" />`
    : `<Button variant="${variant}" color="${MATRIX_COLORS[color]}" />`;

const BOARD_BACKGROUND = "background_page-primary";

const matrixGridStyle = (columns: number, columnGap = "2rem") =>
  ({
    display: "grid",
    gridTemplateColumns: `6rem repeat(${columns}, max-content)`,
    columnGap,
    rowGap: "1rem",
    alignItems: "center",
    justifyItems: "start",
  }) as const;

interface MatrixSectionProps {
  title: string;
  variant: string;
  color: MatrixColor;
  sizes: readonly MatrixSize[];
}

const MatrixSection = ({
  title,
  variant,
  color,
  sizes,
}: MatrixSectionProps) => (
  <StorySection
    title={title}
    description={<StoryJsx>{matrixJsx(variant, color)}</StoryJsx>}
  >
    <Box style={matrixGridStyle(sizes.length)}>
      <Box />
      {sizes.map((size) => (
        <StoryLabel key={size}>{size}</StoryLabel>
      ))}
      {MATRIX_STATES.map((state) => (
        <Fragment key={state}>
          <StoryLabel>{STATE_LABELS[state]}</StoryLabel>
          {sizes.map((size) => (
            <Button
              key={size}
              variant={variant}
              color={MATRIX_COLORS[color]}
              size={size}
              data-spec-cell={`${matrixCell(variant, color, size)}/${state}`}
              {...matrixStateProps(state)}
            >
              Button
            </Button>
          ))}
        </Fragment>
      ))}
    </Box>
  </StorySection>
);

type GroupItemKind = "text" | "icon";

const groupItemCell = (
  variant: string,
  kind: GroupItemKind,
  color: MatrixColor,
  size: MatrixSize,
  state: MatrixState,
) =>
  `${matrixCell(variant, color, size).split("/")[0]}-group-${kind}/${size}/${state}`;

const groupJsx = (variant: string, color: MatrixColor) => {
  const props =
    color === "brand"
      ? `variant="${variant}"`
      : `variant="${variant}" color="${MATRIX_COLORS[color]}"`;
  return [
    "<Button.Group>",
    `  <Button ${props}>Button</Button>`,
    `  <Button ${props} leftSection={<Icon />} />`,
    "</Button.Group>",
  ].join("\n");
};

const groupTitle = (color: MatrixColor) =>
  color === "brand"
    ? "Button.Group"
    : `Button.Group · ${COLOR_TITLES[color].toLowerCase()}`;

const GroupSection = ({
  variant,
  color,
}: {
  variant: string;
  color: MatrixColor;
}) => (
  <StorySection
    title={groupTitle(color)}
    description={<StoryJsx>{groupJsx(variant, color)}</StoryJsx>}
  >
    <Box style={matrixGridStyle(MATRIX_SIZES.length)}>
      <Box />
      {MATRIX_SIZES.map((size) => (
        <StoryLabel key={size}>{size}</StoryLabel>
      ))}
      {MATRIX_STATES.map((state) => (
        <Fragment key={state}>
          <StoryLabel>{STATE_LABELS[state]}</StoryLabel>
          {MATRIX_SIZES.map((size) => (
            <Button.Group key={size}>
              <Button
                variant={variant}
                color={MATRIX_COLORS[color]}
                size={size}
                data-spec-cell={groupItemCell(
                  variant,
                  "text",
                  color,
                  size,
                  state,
                )}
                {...matrixStateProps(state)}
              >
                Button
              </Button>
              <Button
                variant={variant}
                color={MATRIX_COLORS[color]}
                size={size}
                leftSection={<Icon name="chevrondown" />}
                data-spec-cell={groupItemCell(
                  variant,
                  "icon",
                  color,
                  size,
                  state,
                )}
                {...matrixStateProps(state)}
              />
            </Button.Group>
          ))}
        </Fragment>
      ))}
    </Box>
  </StorySection>
);

interface VariantMatrixProps {
  title: string;
  variant: string;
  colors: readonly MatrixColor[];
  sizes?: readonly MatrixSize[];
  groups?: readonly MatrixColor[];
}

const VariantMatrix = ({
  title,
  variant,
  colors,
  sizes = MATRIX_SIZES,
  groups = [],
}: VariantMatrixProps) => (
  <StoryBoard title={title} background={BOARD_BACKGROUND} padding="2rem">
    {colors.map((color) => (
      <MatrixSection
        key={color}
        title={COLOR_TITLES[color]}
        variant={variant}
        color={color}
        sizes={sizes}
      />
    ))}
    {groups.map((color) => (
      <GroupSection key={color} variant={variant} color={color} />
    ))}
  </StoryBoard>
);

const matrixParameters = {
  pseudo: {
    hover: ['[data-spec-cell$="/hover"]'],
    active: ['[data-spec-cell$="/active"]'],
  },
  controls: { disable: true },
};

export const MatrixFilled = {
  name: "Matrix: Filled",
  render: () => (
    <VariantMatrix
      title="Button · filled"
      variant="filled"
      colors={["brand", "negative"]}
      groups={["brand"]}
    />
  ),
  parameters: matrixParameters,
};

export const MatrixDefault = {
  name: "Matrix: Default",
  render: () => (
    <VariantMatrix
      title="Button · default"
      variant="default"
      colors={["brand"]}
      groups={["brand"]}
    />
  ),
  parameters: matrixParameters,
};

export const MatrixLight = {
  name: "Matrix: Light",
  render: () => (
    <VariantMatrix
      title="Button · light"
      variant="light"
      colors={["brand", "negative", "neutral"]}
      groups={["neutral"]}
    />
  ),
  parameters: matrixParameters,
};

export const MatrixSubtle = {
  name: "Matrix: Subtle",
  render: () => (
    <VariantMatrix
      title="Button · subtle"
      variant="subtle"
      colors={["brand", "negative", "neutral"]}
      groups={["brand", "neutral"]}
    />
  ),
  parameters: matrixParameters,
};

export const MatrixCompact = {
  name: "Matrix: Compact",
  render: () => (
    <VariantMatrix
      title="Button · compact"
      variant="transparent"
      colors={["brand"]}
      sizes={COMPACT_SIZES}
    />
  ),
  parameters: matrixParameters,
};

const OnDarkTemplate = () => (
  <StoryBoard title="Button · onDark" padding="2rem" onDark>
    <MatrixSection
      title="Primary"
      variant="on-dark-primary"
      color="brand"
      sizes={MATRIX_SIZES}
    />
    <MatrixSection
      title="Secondary"
      variant="on-dark-secondary"
      color="brand"
      sizes={MATRIX_SIZES}
    />
  </StoryBoard>
);

export const MatrixOnDark = {
  name: "Matrix: onDark",
  render: OnDarkTemplate,
  parameters: matrixParameters,
};

interface SectionColumn {
  key: string;
  variant: string;
  size: MatrixSize;
  colors: readonly MatrixColor[];
}

const SECTION_COLUMNS: readonly SectionColumn[] = [
  { key: "default", variant: "default", size: "md", colors: ["brand"] },
  {
    key: "filled",
    variant: "filled",
    size: "md",
    colors: ["brand", "negative"],
  },
  {
    key: "light",
    variant: "light",
    size: "md",
    colors: ["brand", "negative", "neutral"],
  },
  {
    key: "subtle",
    variant: "subtle",
    size: "md",
    colors: ["brand", "negative", "neutral"],
  },
  {
    key: "compact-md",
    variant: "transparent",
    size: "compact-md",
    colors: ["brand"],
  },
];

const SECTION_ROW_COLORS = ["brand", "negative", "neutral"] as const;

const SECTION_KINDS = [
  {
    key: "left-icon",
    title: "Left · icon",
    jsx: 'leftSection={<Icon name="model" />}',
    props: () => ({ leftSection: <Icon name="model" /> }),
  },
  {
    key: "right-icon",
    title: "Right · icon",
    jsx: 'rightSection={<Icon name="chevrondown" />}',
    props: () => ({ rightSection: <Icon name="chevrondown" /> }),
  },
  {
    key: "right-kbd",
    title: "Right · kbd",
    jsx: 'rightSection={<KeyboardShortcut shortcut="$mod+c" />}',
    props: () => ({ rightSection: <KeyboardShortcut shortcut="$mod+c" /> }),
  },
  {
    key: "right-badge",
    title: "Right · badge",
    jsx: "rightSection={<Badge>1</Badge>}",
    props: () => ({ rightSection: <Badge>1</Badge> }),
  },
] as const;

type SectionKind = (typeof SECTION_KINDS)[number];

const sectionCell = (
  column: SectionColumn,
  color: MatrixColor,
  kind: SectionKind,
  state: MatrixState,
) => {
  const [variant, size] = matrixCell(column.variant, color, column.size).split(
    "/",
  );
  return `${variant}-${kind.key}/${size}/${state}`;
};

const SectionKindSection = ({ kind }: { kind: SectionKind }) => (
  <StorySection
    title={kind.title}
    description={<StoryJsx>{`<Button ${kind.jsx}>Button</Button>`}</StoryJsx>}
  >
    <Box style={matrixGridStyle(SECTION_COLUMNS.length, "1rem")}>
      <Box />
      {SECTION_COLUMNS.map((column) => (
        <StoryLabel key={column.key}>{column.key}</StoryLabel>
      ))}
      {SECTION_ROW_COLORS.map((color) =>
        MATRIX_STATES.map((state) => (
          <Fragment key={`${color}-${state}`}>
            <StoryLabel>
              {color} · {STATE_LABELS[state]}
            </StoryLabel>
            {SECTION_COLUMNS.map((column) =>
              column.colors.includes(color) ? (
                <Button
                  key={column.key}
                  variant={column.variant}
                  size={column.size}
                  color={MATRIX_COLORS[color]}
                  data-spec-cell={sectionCell(column, color, kind, state)}
                  {...matrixStateProps(state)}
                  {...kind.props()}
                >
                  Button
                </Button>
              ) : (
                <Box key={column.key} />
              ),
            )}
          </Fragment>
        )),
      )}
    </Box>
  </StorySection>
);

export const Sections = {
  render: () => (
    <StoryBoard
      title="Button · sections"
      background={BOARD_BACKGROUND}
      padding="1.5rem"
    >
      {SECTION_KINDS.map((kind) => (
        <SectionKindSection key={kind.key} kind={kind} />
      ))}
    </StoryBoard>
  ),
  parameters: matrixParameters,
};
