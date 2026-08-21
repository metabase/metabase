import { Fragment } from "react";

import { Box, Loader, type LoaderProps } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

const SIZE_PX: Record<(typeof SIZES)[number], string> = {
  xs: "12px",
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "22px",
};

const TYPES = ["oval", "dots", "bars"] as const;

const args = {
  size: "md",
  type: "oval",
};

const argTypes = {
  size: {
    options: SIZES,
    control: { type: "inline-radio" },
  },
  type: {
    options: TYPES,
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Components/Feedback/Loader",
  component: Loader,
  args,
  argTypes,
};

export const Default = {
  render: (args: LoaderProps) => <Loader {...args} />,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "20rem 4rem max-content",
  columnGap: "2rem",
  rowGap: "1rem",
  alignItems: "center",
  justifyItems: "start",
} as const;

const OverviewTemplate = () => (
  <StoryShowcase title="Loader">
    <StorySection title="Sizes" description="The default size is “md”.">
      <Box style={gridStyle}>
        {SIZES.map((size) => (
          <Fragment key={size}>
            <StoryJsx>{`<Loader size="${size}" />`}</StoryJsx>
            <StoryJsx>{SIZE_PX[size]}</StoryJsx>
            <Loader size={size} />
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection
      title="Types"
      description="Only “oval” is specified in Figma, and the size scale is tuned to it — dots and bars render smaller than their name suggests."
    >
      <Box style={gridStyle}>
        {TYPES.map((type) => (
          <Fragment key={type}>
            <StoryJsx>{`<Loader type="${type}" />`}</StoryJsx>
            <div />
            <Loader type={type} />
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection
      title="Color"
      description="Defaults to the icon-brand token. An explicit color prop overrides it."
    >
      <Box style={gridStyle}>
        <StoryJsx>{`<Loader />`}</StoryJsx>
        <div />
        <Loader />

        <StoryJsx>{`<Loader color="text-secondary" />`}</StoryJsx>
        <div />
        <Loader color="text-secondary" />

        <StoryJsx>{`<Loader color="core-white" />`}</StoryJsx>
        <div />
        {/* On a brand fill, as in ActionButton. `core-brand` rather than a
            surface token so the white stays visible in both themes. */}
        <Box bg="core-brand" p="sm" style={{ lineHeight: 0 }}>
          <Loader color="core-white" />
        </Box>
      </Box>
    </StorySection>

    <StorySection
      title="Label"
      description="Renders the loader stacked above a caption."
    >
      <Box style={gridStyle}>
        <StoryJsx>{`<Loader label="Loading…" />`}</StoryJsx>
        <div />
        <Loader label="Loading…" />
      </Box>
    </StorySection>
  </StoryShowcase>
);

export const Overview = {
  render: OverviewTemplate,
  args: { theme: "light" },
  parameters: {
    controls: { include: ["theme"] },
  },
};
