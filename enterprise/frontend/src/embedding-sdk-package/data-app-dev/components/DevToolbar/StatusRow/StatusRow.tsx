import type { ReactNode } from "react";

import S from "../DevToolbar.module.css";

type Props = {
  label: string;
  children: ReactNode;
};

export const StatusRow = ({ label, children }: Props) => (
  <div className={S.StatusRow}>
    <span className={S.StatusLabel}>{label}</span>
    <span className={S.StatusValue}>{children}</span>
  </div>
);
