import noResultsSource from "assets/img/no_results.svg";
import { Box, Image, type ImageProps } from "metabase/ui";

const args = {
  width: 120,
  height: 120,
  fit: "cover",
  position: "center",
  src: noResultsSource,
  alt: "No search results",
};

const argTypes = {
  fit: {
    control: {
      type: "inline-radio",
      options: ["cover", "contain", "fill", "none", "scale-down"],
    },
  },
  position: {
    control: {
      type: "inline-radio",
      options: ["top left", "top", "center", "bottom", "bottom right"],
    },
  },
  src: {
    control: { type: "file", accept: "image/jpeg,image/png,image/svg+xml" },
  },
};

const DefaultTemplate = (args: ImageProps) => (
  <Box maw="20rem">
    <Image {...args} />
  </Box>
);

export default {
  title: "Data display/Image",
  component: Image,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const BackgroundPosition = {
  render: DefaultTemplate,
  name: "BackgroundPosition",
  args: {
    width: 80,
    position: "top left",
  },
};
