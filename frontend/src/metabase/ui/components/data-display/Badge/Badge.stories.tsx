import { Fragment, type ReactNode } from "react";

import {
  Badge,
  type BadgeColor,
  type BadgeProps,
  Box,
  Group,
  Text,
} from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

const VARIANTS = ["filled", "light", "outline"] as const;
const COLORS: BadgeColor[] = [
  "neutral",
  "brand",
  "negative",
  "warning",
  "positive",
];
const SIZES = ["xs", "sm"] as const;

const args = {
  variant: "light",
  color: "neutral",
  size: "xs",
  children: "Badge",
};

const argTypes = {
  variant: {
    options: VARIANTS,
    control: { type: "inline-radio" },
  },
  color: {
    options: COLORS,
    control: { type: "inline-radio" },
  },
  size: {
    options: SIZES,
    control: { type: "inline-radio" },
  },
  circle: {
    control: { type: "boolean" },
  },
  children: {
    control: { type: "text" },
  },
};

export default {
  title: "Components/Data display/Badge",
  component: Badge,
  args,
  argTypes,
};

export const Default = {
  render: (args: BadgeProps) => <Badge {...args} />,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "24rem 4rem 4rem",
  columnGap: "1rem",
  rowGap: "0.75rem",
  alignItems: "center",
} as const;

const SizeHeader = () => (
  <>
    <div />
    {SIZES.map((size) => (
      <Text key={size} size="sm" fw="bold" c="text-secondary">
        {size}
      </Text>
    ))}
  </>
);

const VariantSection = ({
  variant,
  children,
}: {
  variant: (typeof VARIANTS)[number];
  children: ReactNode;
}) => (
  <StorySection title={variant[0].toUpperCase() + variant.slice(1)}>
    <Box style={gridStyle}>
      {COLORS.map((color) => (
        <Fragment key={color}>
          <StoryJsx>{`<Badge variant="${variant}" color="${color}" />`}</StoryJsx>
          {SIZES.map((size) => (
            <Badge key={size} variant={variant} color={color} size={size}>
              {children}
            </Badge>
          ))}
        </Fragment>
      ))}
    </Box>
  </StorySection>
);

const Overview = ({ children }: BadgeProps) => (
  <StoryShowcase title="Badge">
    <StorySection title="Sizes" description="Note: the default size is “xs”.">
      <Box style={gridStyle}>
        <SizeHeader />
        <StoryJsx>{`<Badge size="…" />`}</StoryJsx>
        {SIZES.map((size) => (
          <Badge key={size} size={size}>
            {children}
          </Badge>
        ))}
      </Box>
    </StorySection>

    {VARIANTS.map((variant) => (
      <VariantSection key={variant} variant={variant}>
        {children}
      </VariantSection>
    ))}

    <StorySection title="Circle">
      <Box style={gridStyle}>
        <StoryJsx>{`<Badge variant="filled" color="neutral" circle />`}</StoryJsx>
        {SIZES.map((size) => (
          <Badge key={size} variant="filled" color="neutral" circle size={size}>
            1
          </Badge>
        ))}
      </Box>
    </StorySection>

    <StorySection title="Indicator">
      <Box style={{ ...gridStyle, gridTemplateColumns: "24rem 8rem" }}>
        <StoryJsx>{`<Badge indicator color="…" />`}</StoryJsx>
        <Group gap="sm">
          {COLORS.map((color) => (
            <Badge key={color} indicator color={color} />
          ))}
        </Group>
      </Box>
    </StorySection>
  </StoryShowcase>
);

export const SizesAndVariants = {
  render: Overview,
  name: "Sizes and variants",
  args: { theme: "light" },
  parameters: {
    controls: { include: ["theme", "children"] },
  },
};
