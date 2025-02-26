import { Input, InputWrapper, rem } from "@mantine/core";

import Styles from "./Input.module.css";

const PADDING = 12;
const DEFAULT_ICON_WIDTH = 40;
const UNSTYLED_ICON_WIDTH = 28;
const BORDER_WIDTH = 1;

export const inputOverrides = {
  Input: Input.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      wrapper: Styles.wrapper,
      input: Styles.input,
      section: Styles.section,
    },
    vars: (theme, { radius, leftSection, rightSection, variant }) => ({
      wrapper: {
        "--input-border-radius": radius ?? theme.radius.xs,
        "--input-padding-inline-start": leftSection
          ? rem(DEFAULT_ICON_WIDTH - BORDER_WIDTH)
          : rem(PADDING - BORDER_WIDTH),
        "--input-padding-inline-end": rightSection
          ? rem(DEFAULT_ICON_WIDTH - BORDER_WIDTH)
          : rem(PADDING - BORDER_WIDTH),
        "--input-right-section-width":
          variant === "unstyled"
            ? rem(UNSTYLED_ICON_WIDTH)
            : rem(DEFAULT_ICON_WIDTH),
      },
    }),
  }),
  InputWrapper: InputWrapper.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "error", "input"],
    },
    classNames: {
      label: Styles.label,
      description: Styles.description,
      error: Styles.error,
      required: Styles.required,
    },
  }),
  InputLabel: Input.Label.extend({
    classNames: {
      label: Styles.label,
    },
  }),
};
