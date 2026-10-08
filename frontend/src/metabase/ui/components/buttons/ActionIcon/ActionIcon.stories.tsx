import { Fragment } from "react";

import { Box, Icon } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StoryLabel,
  StorySection,
} from "metabase/ui/stories/showcase";

import { ActionIcon, type ActionIconProps } from "./";

const args = {
  variant: "default",
  color: undefined,
  size: "md",
  disabled: false,
  loading: false,
};

const argTypes = {
  variant: {
    options: [
      "default",
      "light",
      "subtle",
      "filled",
      "outline",
      "transparent",
      "warning",
    ],
    control: { type: "select" },
  },
  color: {
    options: [undefined, "brand", "negative", "positive"],
    control: { type: "inline-radio" },
  },
  size: {
    options: ["xs", "sm", "md", "lg"],
    control: { type: "inline-radio" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  loading: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = (args: ActionIconProps) => (
  <ActionIcon aria-label="action" {...args}>
    <Icon name="model" />
  </ActionIcon>
);

export default {
  title: "Components/Buttons/ActionIcon",
  component: ActionIcon,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

const MATRIX_SIZES = ["xs", "sm", "md", "lg"] as const;
const NO_XS_SIZES = ["sm", "md", "lg"] as const;
const GROUP_SIZES = ["md", "lg"] as const;
const MATRIX_STATES = [
  "default",
  "hover",
  "active",
  "disabled",
  "loading",
] as const;

const MATRIX_COLORS = {
  neutral: undefined,
  brand: "brand",
} as const;

const COLOR_TITLES: Record<MatrixColor, string> = {
  neutral: "Neutral",
  brand: "Brand",
};

const STATE_LABELS: Record<MatrixState, string> = {
  default: "default",
  hover: "hover",
  active: "pressed",
  disabled: "disabled",
  loading: "loading",
};

type MatrixVariant = "default" | "light" | "subtle";
type MatrixSize = (typeof MATRIX_SIZES)[number];
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

const matrixCell = (variant: MatrixVariant, color: MatrixColor) =>
  color === "neutral" ? variant : `${variant}-${color}`;

const matrixJsx = (variant: MatrixVariant, color: MatrixColor) =>
  color === "neutral"
    ? `<ActionIcon variant="${variant}" />`
    : `<ActionIcon variant="${variant}" color="${MATRIX_COLORS[color]}" />`;

const BOARD_BACKGROUND = "background_page-primary";

const matrixGridStyle = (columns: number) =>
  ({
    display: "grid",
    gridTemplateColumns: `6rem repeat(${columns}, max-content)`,
    columnGap: "2rem",
    rowGap: "1rem",
    alignItems: "center",
    justifyItems: "start",
  }) as const;

interface MatrixSectionProps {
  title: string;
  variant: MatrixVariant;
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
            <ActionIcon
              key={size}
              variant={variant}
              color={MATRIX_COLORS[color]}
              size={size}
              aria-label="action"
              data-spec-cell={`${matrixCell(variant, color)}/${size}/${state}`}
              {...matrixStateProps(state)}
            >
              <Icon name="model" />
            </ActionIcon>
          ))}
        </Fragment>
      ))}
    </Box>
  </StorySection>
);

const groupJsx = (variant: MatrixVariant) =>
  [
    "<ActionIcon.Group>",
    `  <ActionIcon variant="${variant}" />`,
    `  <ActionIcon variant="${variant}" />`,
    "</ActionIcon.Group>",
  ].join("\n");

const groupCell = (variant: MatrixVariant) =>
  variant === "subtle" ? "group" : `group-${variant}`;

const GroupSection = ({ variant }: { variant: MatrixVariant }) => (
  <StorySection
    title="ActionIcon.Group"
    description={<StoryJsx>{groupJsx(variant)}</StoryJsx>}
  >
    <Box style={matrixGridStyle(GROUP_SIZES.length)}>
      <Box />
      {GROUP_SIZES.map((size) => (
        <StoryLabel key={size}>{size}</StoryLabel>
      ))}
      {MATRIX_STATES.map((state) => (
        <Fragment key={state}>
          <StoryLabel>{STATE_LABELS[state]}</StoryLabel>
          {GROUP_SIZES.map((size) => (
            <ActionIcon.Group key={size}>
              <ActionIcon
                variant={variant}
                size={size}
                aria-label="action"
                data-spec-cell={`${groupCell(variant)}/${size}/${state}`}
                {...matrixStateProps(state)}
              >
                <Icon name="model" />
              </ActionIcon>
              <ActionIcon
                variant={variant}
                size={size}
                aria-label="more"
                data-group-state={state}
                {...matrixStateProps(state)}
              >
                <Icon name="model" />
              </ActionIcon>
            </ActionIcon.Group>
          ))}
        </Fragment>
      ))}
    </Box>
  </StorySection>
);

interface VariantMatrixProps {
  title: string;
  variant: MatrixVariant;
  colors: readonly MatrixColor[];
  sizes?: readonly MatrixSize[];
  group?: boolean;
}

const VariantMatrix = ({
  title,
  variant,
  colors,
  sizes = MATRIX_SIZES,
  group = false,
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
    {group && <GroupSection variant={variant} />}
  </StoryBoard>
);

const matrixParameters = {
  pseudo: {
    hover: ['[data-spec-cell$="/hover"]', '[data-group-state="hover"]'],
    active: ['[data-spec-cell$="/active"]', '[data-group-state="active"]'],
  },
  controls: { disable: true },
};

export const VariantDefault = {
  name: "Variant: Default",
  render: () => (
    <VariantMatrix
      title="ActionIcon · default"
      variant="default"
      colors={["neutral"]}
      sizes={NO_XS_SIZES}
      group
    />
  ),
  parameters: matrixParameters,
};

export const VariantLight = {
  name: "Variant: Light",
  render: () => (
    <VariantMatrix
      title="ActionIcon · light"
      variant="light"
      colors={["neutral"]}
      sizes={NO_XS_SIZES}
      group
    />
  ),
  parameters: matrixParameters,
};

export const VariantSubtle = {
  name: "Variant: Subtle",
  render: () => (
    <VariantMatrix
      title="ActionIcon · subtle"
      variant="subtle"
      colors={["neutral", "brand"]}
      group
    />
  ),
  parameters: matrixParameters,
};
