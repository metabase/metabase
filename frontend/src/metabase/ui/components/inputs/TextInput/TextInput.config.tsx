import { TextInput } from "@mantine/core";

export const textInputOverrides = {
  TextInput: TextInput.extend({
    defaultProps: {
      size: "md",
    },
  }),
};
