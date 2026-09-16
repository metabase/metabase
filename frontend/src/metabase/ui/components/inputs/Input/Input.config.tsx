import { Input, InputWrapper, rem } from "@mantine/core";

import Styles from "./Input.module.css";

const ICON_SIZE = 12;
const PADDING: Record<string, number> = { sm: 6, md: 8, lg: 12 };
const RADIUS: Record<string, string> = { sm: "xs", md: "xs", lg: "sm" };

const paddingFor = (size: string) => PADDING[size] ?? PADDING.md;
const sectionWidth = (size: string) => rem(paddingFor(size) * 2 + ICON_SIZE);

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
    vars: (
      _theme,
      { size = "md", radius, leftSection, rightSection, rightSectionWidth },
    ) => ({
      wrapper: {
        "--input-radius":
          radius == null
            ? `var(--mantine-radius-${RADIUS[size] ?? RADIUS.md})`
            : undefined,
        "--input-padding-inline-start": leftSection
          ? sectionWidth(size)
          : rem(paddingFor(size)),
        "--input-padding-inline-end": rightSection
          ? sectionWidth(size)
          : rem(paddingFor(size)),
        "--input-left-section-width": sectionWidth(size),
        "--input-right-section-width":
          typeof rightSectionWidth === "string"
            ? rightSectionWidth
            : sectionWidth(size),
      },
    }),
  }),
  InputWrapper: InputWrapper.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
    },
    classNames: {
      root: Styles.root,
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
