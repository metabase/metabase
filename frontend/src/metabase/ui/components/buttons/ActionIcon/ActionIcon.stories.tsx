import { Fragment } from "react";

import { Box, Icon } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StoryLabel,
  StorySection,
} from "metabase/ui/stories/showcase";

import { ActionIcon, type ActionIconProps, type ActionIconVariant } from "./";

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
      "filled",
      "light",
      "subtle",
      "on-dark-primary",
      "on-dark-secondary",
    ],
    control: { type: "inline-radio" },
  },
  color: {
    options: [undefined, "brand", "negative", "positive", "warning", "neutral"],
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
const SELECTABLE_STATES = [
  "default",
  "hover",
  "active",
  "disabled",
  "selected",
  "selected-hover",
  "selected-disabled",
] as const;

const MATRIX_COLORS = {
  neutral: undefined,
  brand: "brand",
  negative: "negative",
  positive: "positive",
  warning: "warning",
} as const;

const COLOR_TITLES: Record<MatrixColor, string> = {
  neutral: "Neutral",
  brand: "Brand",
  negative: "Negative",
  positive: "Positive",
  warning: "Warning",
};

const STATE_LABELS: Record<MatrixState, string> = {
  default: "default",
  hover: "hover",
  active: "pressed",
  disabled: "disabled",
  loading: "loading",
  selected: "selected",
  "selected-hover": "hover (selected)",
  "selected-disabled": "disabled (selected)",
};

type MatrixSize = (typeof MATRIX_SIZES)[number];
type MatrixState =
  | (typeof MATRIX_STATES)[number]
  | (typeof SELECTABLE_STATES)[number];
type MatrixColor = keyof typeof MATRIX_COLORS;

const SELECTED_STATE = "selected";
const SELECTED_STATE_PREFIX = `${SELECTED_STATE}-`;

const isSelectedState = (state: MatrixState) =>
  state === SELECTED_STATE || state.startsWith(SELECTED_STATE_PREFIX);

const matrixStateProps = (
  state: MatrixState,
): { disabled?: boolean; loading?: boolean; selected?: boolean } => {
  const selectedProps = isSelectedState(state) ? { selected: true } : {};
  if (state === "disabled" || state === "selected-disabled") {
    return { ...selectedProps, disabled: true };
  }
  if (state === "loading") {
    return { loading: true };
  }
  return selectedProps;
};

const specCellKey = (cell: string, size: MatrixSize, state: MatrixState) => {
  if (state === SELECTED_STATE) {
    return `${cell}-${SELECTED_STATE}/${size}/default`;
  }
  if (state.startsWith(SELECTED_STATE_PREFIX)) {
    return `${cell}-${SELECTED_STATE}/${size}/${state.slice(SELECTED_STATE_PREFIX.length)}`;
  }
  return `${cell}/${size}/${state}`;
};

const matrixCell = (
  variant: ActionIconVariant,
  color: MatrixColor,
  rounded: boolean,
) =>
  [variant, color === "neutral" ? null : color, rounded ? "rounded" : null]
    .filter(Boolean)
    .join("-");

const matrixJsx = (
  variant: ActionIconVariant,
  color: MatrixColor,
  rounded: boolean,
  selectable: boolean,
) =>
  [
    "<ActionIcon",
    `variant="${variant}"`,
    color === "neutral" ? null : `color="${MATRIX_COLORS[color]}"`,
    rounded ? 'radius="xl"' : null,
    selectable ? "selected={selected}" : null,
    "/>",
  ]
    .filter(Boolean)
    .join(" ");

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
  variant: ActionIconVariant;
  color: MatrixColor;
  sizes: readonly MatrixSize[];
  rounded?: boolean;
  states?: readonly MatrixState[];
}

const MatrixSection = ({
  title,
  variant,
  color,
  sizes,
  rounded = false,
  states = MATRIX_STATES,
}: MatrixSectionProps) => {
  const selectable = states === SELECTABLE_STATES;
  return (
    <StorySection
      title={title}
      description={
        <StoryJsx>{matrixJsx(variant, color, rounded, selectable)}</StoryJsx>
      }
    >
      <Box style={matrixGridStyle(sizes.length)}>
        <Box />
        {sizes.map((size) => (
          <StoryLabel key={size}>{size}</StoryLabel>
        ))}
        {states.map((state) => (
          <Fragment key={state}>
            <StoryLabel>{STATE_LABELS[state]}</StoryLabel>
            {sizes.map((size) => (
              <ActionIcon
                key={size}
                variant={variant}
                color={MATRIX_COLORS[color]}
                size={size}
                radius={rounded ? "xl" : undefined}
                aria-label="action"
                data-spec-cell={specCellKey(
                  selectable
                    ? `selectable-${matrixCell(variant, color, rounded)}`
                    : matrixCell(variant, color, rounded),
                  size,
                  state,
                )}
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
};

const groupJsx = (variant: ActionIconVariant) =>
  [
    "<ActionIcon.Group>",
    `  <ActionIcon variant="${variant}" />`,
    `  <ActionIcon variant="${variant}" />`,
    "</ActionIcon.Group>",
  ].join("\n");

const groupCell = (variant: ActionIconVariant) =>
  variant === "subtle" ? "group" : `group-${variant}`;

const GroupSection = ({ variant }: { variant: ActionIconVariant }) => (
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
  variant: ActionIconVariant;
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
    <StoryBoard
      title="ActionIcon · default"
      background={BOARD_BACKGROUND}
      padding="2rem"
    >
      <MatrixSection
        title="Neutral"
        variant="default"
        color="neutral"
        sizes={NO_XS_SIZES}
      />
      <MatrixSection
        title="Rounded"
        variant="default"
        color="neutral"
        sizes={NO_XS_SIZES}
        rounded
      />
      <GroupSection variant="default" />
    </StoryBoard>
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
      colors={["neutral", "brand", "negative", "positive", "warning"]}
      group
    />
  ),
  parameters: matrixParameters,
};

export const VariantFilled = {
  name: "Variant: Filled",
  render: () => (
    <VariantMatrix
      title="ActionIcon · filled"
      variant="filled"
      colors={["brand"]}
      sizes={NO_XS_SIZES}
    />
  ),
  parameters: matrixParameters,
};

export const VariantOnDark = {
  name: "Variant: On Dark",
  render: () => (
    <StoryBoard title="ActionIcon · on dark" padding="2rem" onDark>
      <MatrixSection
        title="Primary"
        variant="on-dark-primary"
        color="neutral"
        sizes={NO_XS_SIZES}
      />
      <MatrixSection
        title="Secondary"
        variant="on-dark-secondary"
        color="neutral"
        sizes={NO_XS_SIZES}
      />
    </StoryBoard>
  ),
  parameters: matrixParameters,
};

export const Selectable = {
  render: () => (
    <StoryBoard
      title="ActionIcon · selectable"
      background={BOARD_BACKGROUND}
      padding="2rem"
    >
      {(["light", "subtle"] as const).flatMap((variant) =>
        [false, true].map((rounded) => (
          <MatrixSection
            key={`${variant}-${rounded}`}
            title={`${variant === "light" ? "Light" : "Subtle"}${rounded ? " · rounded" : ""}`}
            variant={variant}
            color="neutral"
            sizes={NO_XS_SIZES}
            rounded={rounded}
            states={SELECTABLE_STATES}
          />
        )),
      )}
    </StoryBoard>
  ),
  parameters: matrixParameters,
};
