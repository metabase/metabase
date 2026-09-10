import { Fragment } from "react";

import { Badge, Box, Icon, KeyboardShortcut } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StoryLabel,
  StorySection,
} from "metabase/ui/stories/showcase";

import { Button, type ButtonProps, type ButtonVariant } from "./";

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
    options: ["default", "filled", "light", "subtle", "transparent"],
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
    options: ["sm", "md", "lg", "compact-sm", "compact-md"],
    control: { type: "inline-radio" },
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

export default {
  title: "Components/Buttons/Button",
  component: Button,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
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

const matrixCell = (
  variant: ButtonVariant,
  color: MatrixColor,
  size: MatrixSize,
) => `${color === "brand" ? variant : `${variant}-${color}`}/${size}`;

const matrixJsx = (variant: ButtonVariant, color: MatrixColor) =>
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
  variant: ButtonVariant;
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
  variant: ButtonVariant,
  kind: GroupItemKind,
  color: MatrixColor,
  size: MatrixSize,
  state: MatrixState,
) =>
  `${matrixCell(variant, color, size).split("/")[0]}-group-${kind}/${size}/${state}`;

const groupJsx = (variant: ButtonVariant, color: MatrixColor) => {
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
  variant: ButtonVariant;
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
  variant: ButtonVariant;
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

export const VariantFilled = {
  name: "Variant: Filled",
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

export const VariantDefault = {
  name: "Variant: Default",
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

export const VariantLight = {
  name: "Variant: Light",
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

export const VariantSubtle = {
  name: "Variant: Subtle",
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

const OnDarkTemplate = () => (
  <StoryBoard title="Button · on dark" padding="2rem" onDark>
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

export const VariantOnDark = {
  name: "Variant: On Dark",
  render: OnDarkTemplate,
  parameters: matrixParameters,
};

export const Compact = {
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

interface SectionColumn {
  key: string;
  variant: ButtonVariant;
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
