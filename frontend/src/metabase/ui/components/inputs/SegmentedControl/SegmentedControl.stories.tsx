import { Box, Center, Icon, SegmentedControl } from "metabase/ui";

const args = {
  data: [
    {
      label: (
        <Center>
          <Icon name="embed" />
          <Box ml="0.5rem">Code</Box>
        </Center>
      ),
      value: "code",
    },
    {
      label: (
        <Center>
          <Icon name="eye_filled" />
          <Box ml="0.5rem">Preview</Box>
        </Center>
      ),
      value: "preview",
    },
  ],
  fullWidth: false,
  shouldAnimate: true,
};

export default {
  title: "Components/Inputs/SegmentedControl",
  component: SegmentedControl,
  args,
};

export const Default = {};

export const FullWidth = {
  name: "Full width",
  args: {
    data: [
      {
        label: "Light",
        value: "light",
      },
      {
        label: "Dark",
        value: "dark",
      },
      {
        label: "Transparent",
        value: "transparent",
      },
    ],
    fullWidth: true,
  },
};

export const Color = {
  args: {
    data: [
      {
        label: "Light",
        value: "light",
      },
      {
        label: "Dark",
        value: "dark",
      },
      {
        label: "Transparent",
        value: "transparent",
      },
    ],
    color: "brand",
    c: "var(--mb-color-text-primary-inverse)",
  },
};
