import {
  CheckboxCard as MantineCheckboxCard,
  type CheckboxCardProps as MantineCheckboxCardProps,
  CheckboxIndicator as MantineCheckboxIndicator,
} from "@mantine/core";
import type { ReactNode } from "react";

import S from "./Checkbox.module.css";

export type CheckboxCardProps = MantineCheckboxCardProps & {
  label?: ReactNode;
  description?: ReactNode;
};

export const CheckboxCard = ({
  label,
  description,
  disabled,
  ...props
}: CheckboxCardProps) => (
  <MantineCheckboxCard disabled={disabled} {...props}>
    <MantineCheckboxIndicator disabled={disabled} />
    <div className={S.cardBody}>
      {label && <div className={S.cardLabel}>{label}</div>}
      {description && <div className={S.cardDescription}>{description}</div>}
    </div>
  </MantineCheckboxCard>
);
