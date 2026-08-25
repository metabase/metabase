import {
  RadioCard as MantineRadioCard,
  type RadioCardProps as MantineRadioCardProps,
  RadioIndicator as MantineRadioIndicator,
} from "@mantine/core";
import type { ReactNode } from "react";

import S from "./Radio.module.css";

export type RadioCardProps = Omit<MantineRadioCardProps, "children"> & {
  label?: ReactNode;
  description?: ReactNode;
  leftSection?: ReactNode;
  disabled?: boolean;
  withIndicator?: boolean;
};

export const RadioCard = ({
  label,
  description,
  leftSection,
  disabled,
  withIndicator = true,
  ...props
}: RadioCardProps) => (
  <MantineRadioCard disabled={disabled} {...props}>
    {withIndicator && <MantineRadioIndicator disabled={disabled} />}
    {leftSection}
    <div className={S.cardBody}>
      {label && <div className={S.cardLabel}>{label}</div>}
      {description && <div className={S.cardDescription}>{description}</div>}
    </div>
  </MantineRadioCard>
);
