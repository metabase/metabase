/* eslint-disable i18next/no-literal-string */
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
    ⚠ Diagnostics{count > 0 ? ` (${count})` : ""}
  </button>
);
