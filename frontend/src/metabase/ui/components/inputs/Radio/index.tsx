import { Radio as MantineRadio } from "@mantine/core";

import { RadioCard } from "./RadioCard";

export const Radio = Object.assign(MantineRadio, { Card: RadioCard });
export { radioOverrides } from "./Radio.config";
export type { RadioProps, RadioGroupProps } from "@mantine/core";
export type { RadioCardProps } from "./RadioCard";
