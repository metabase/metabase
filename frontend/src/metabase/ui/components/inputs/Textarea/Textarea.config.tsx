import { type MantineThemeOverride, Textarea, rem } from "@mantine/core";

const LINE_HEIGHT = 20;
const BORDER_WIDTH = 0.5;
const PADDING_Y: Record<string, number> = { sm: 2, md: 6, lg: 10 };

const paddingYFor = (size: string) => PADDING_Y[size] ?? PADDING_Y.md;

export const textareaOverrides: MantineThemeOverride["components"] = {
  Textarea: Textarea.extend({
    defaultProps: {
      size: "md",
      autosize: true,
      minRows: 2,
      maxRows: 6,
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
    },
    styles: (_theme, { size = "md", variant }) => ({
      input: {
        "--input-padding-y":
          variant === "unstyled"
            ? undefined
            : rem(paddingYFor(size) - BORDER_WIDTH),
        "--input-line-height": rem(LINE_HEIGHT),
      },
    }),
  }),
};
