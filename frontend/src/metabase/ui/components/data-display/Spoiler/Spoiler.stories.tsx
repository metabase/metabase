import { Spoiler, type SpoilerProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

const args = {
  showLabel: "Show",
  hideLabel: "Hide",
  maxHeight: 48,
};

const argTypes = {
  showLabel: {
    control: { type: "text" },
  },
  hideLabel: {
    control: { type: "text" },
  },
  maxHeight: {
    control: { type: "number" },
  },
};

export default {
  title: "Components/Data display/Spoiler",
  component: Spoiler,
  args,
  argTypes,
};

export const Default = {
  render: (args: SpoilerProps) => (
    <Box maw="20rem">
      <Spoiler {...args}>
        <Text>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce ac
          ligula sit amet urna placerat placerat. Quisque suscipit rutrum est et
          malesuada. Suspendisse potenti. Integer nec tortor tortor.
        </Text>
      </Spoiler>
    </Box>
  ),
};
