import {
  Radio as MantineRadio,
  type RadioProps as MantineRadioProps,
} from "@mantine/core";
import { forwardRef } from "react";

import { RadioCard } from "./RadioCard";

export type RadioProps = Omit<MantineRadioProps, "labelPosition" | "size">;

const RadioRoot = forwardRef<HTMLInputElement, RadioProps>(
  function RadioRoot(props, ref) {
    return <MantineRadio {...props} ref={ref} />;
  },
);

export const Radio = Object.assign(RadioRoot, {
  Group: MantineRadio.Group,
  Indicator: MantineRadio.Indicator,
  Card: RadioCard,
});

export { radioOverrides } from "./Radio.config";
export type { RadioGroupProps } from "@mantine/core";
export type { RadioCardProps } from "./RadioCard";
