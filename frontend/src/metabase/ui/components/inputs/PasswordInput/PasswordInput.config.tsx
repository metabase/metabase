import { PasswordInput, rem } from "@mantine/core";
import { t } from "ttag";

import { Icon } from "../../icons";

import Styles from "./PasswordInput.module.css";

const ICON_SIZE = rem(12);
// Button = icon + horizontal inset on both sides, so the eye lands at the
// same distance from the edge as the text (6 / 8 / 12px).
const TOGGLE_BUTTON_SIZE: Record<string, string> = {
  sm: rem(24),
  md: rem(28),
  lg: rem(36),
};

const VisibilityToggleIcon = ({ reveal }: { reveal: boolean }) => (
  <Icon
    name={reveal ? "eye_crossed_out" : "eye"}
    style={{ width: "var(--psi-icon-size)", height: "var(--psi-icon-size)" }}
  />
);

export const passwordInputOverrides = {
  PasswordInput: PasswordInput.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
      visibilityToggleIcon: VisibilityToggleIcon,
      visibilityToggleButtonProps: {
        get "aria-label"() {
          return t`Toggle password visibility`;
        },
        variant: "transparent",
      },
    },
    classNames: {
      root: Styles.root,
      wrapper: Styles.wrapper,
      label: Styles.label,
      input: Styles.input,
      innerInput: Styles.innerInput,
      section: Styles.section,
      visibilityToggle: Styles.visibilityToggle,
      error: Styles.error,
    },
    vars: (_theme, { size = "md" }) => ({
      root: {
        "--psi-icon-size": ICON_SIZE,
        "--psi-button-size": TOGGLE_BUTTON_SIZE[size] ?? TOGGLE_BUTTON_SIZE.md,
      },
    }),
  }),
};
