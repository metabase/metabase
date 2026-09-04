import type { MouseEvent as ReactMouseEvent } from "react";

import S from "../DevToolbar.module.css";

type Props = {
  onMouseDown: (event: ReactMouseEvent) => void;
};

export const ResizeHandle = ({ onMouseDown }: Props) => (
  <div
    className={S.ResizeHandle}
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize diagnostics panel"
    onMouseDown={onMouseDown}
  />
);
