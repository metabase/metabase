import cx from "classnames";

import S from "../DevToolbar.module.css";

interface Props {
  count: number;
  onOpen: () => void;
}

export const DiagnosticsToggle = ({ count, onOpen }: Props) => (
  <button
    type="button"
    className={cx(S.Toggle, { [S.ToggleHasErrors]: count > 0 })}
    onClick={onOpen}
    title="Data app diagnostics"
  >
    {count > 0 ? `⚠ Diagnostics (${count})` : "Diagnostics"}
  </button>
);
