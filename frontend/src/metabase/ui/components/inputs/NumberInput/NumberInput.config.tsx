import { NumberInput, rem } from "@mantine/core";

import Styles from "./NumberInput.module.css";

const CHEVRON_SIZE = 12;

export const numberInputOverrides = {
  NumberInput: NumberInput.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
      hideControls: true,
    },
    classNames: {
      root: Styles.root,
      wrapper: Styles.wrapper,
      controls: Styles.controls,
      control: Styles.control,
    },
    vars: () => ({
      controls: {
        "--ni-chevron-size": rem(CHEVRON_SIZE),
      },
    }),
  }),
};
