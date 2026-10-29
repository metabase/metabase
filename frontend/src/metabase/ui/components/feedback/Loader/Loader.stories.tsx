import { Fragment } from "react";

import { Box, Loader, type LoaderProps } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";
import { getObjectKeys } from "metabase/utils/objects";

import { LOADER_SIZES } from "./Loader.config";

const SIZES = getObjectKeys(LOADER_SIZES);

const args = {
  size: "md",
};

const argTypes = {
  size: {
    options: SIZES,
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

const grid2Columns = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  columnGap: "2rem",
  rowGap: "1rem",
  alignItems: "center",
  justifyItems: "start",
  padding: "1rem 0",
} as const;

const grid3Columns = {
  ...grid2Columns,
  gridTemplateColumns: "1fr 1fr 1fr",
} as const;

const OverviewTemplate = () => (
  <StoryShowcase title="Loader">
    <StorySection title="Sizes" description="The default size is “md”.">
      <Box style={grid3Columns}>
        {SIZES.map((size) => (
          <Fragment key={size}>
            <StoryJsx>{`<Loader size="${size}" />`}</StoryJsx>
            <StoryJsx>{`${LOADER_SIZES[size]}px`}</StoryJsx>
            <Loader size={size} />
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection title="Types">
      <Box style={grid2Columns}>
        <StoryJsx>{`<Loader type="oval" />`}</StoryJsx>
        <Loader type="oval" />
        <StoryJsx>{`<Loader type="dots" />`}</StoryJsx>
        <Loader type="dots" />
      </Box>
    </StorySection>

    <StorySection
      title="Color"
      description="Defaults to the icon-brand token. An explicit color prop overrides it."
    >
      <Box style={grid2Columns}>
        <StoryJsx>{`<Loader />`}</StoryJsx>
        <Loader />
        <StoryJsx>{`<Loader color="text-secondary" />`}</StoryJsx>
        <Loader color="text-secondary" />
      </Box>
    </StorySection>

    <StorySection
      title="Label"
      description="Renders the loader stacked above a caption. The caption uses “sm” text for the xs and sm loaders, and “md” text for the rest."
    >
      <Box style={grid2Columns}>
        {SIZES.map((size) => (
          <Fragment key={size}>
            <StoryJsx>{`<Loader size="${size}" label="Loading…" />`}</StoryJsx>
            <Loader size={size} label="Loading…" />
          </Fragment>
        ))}
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
