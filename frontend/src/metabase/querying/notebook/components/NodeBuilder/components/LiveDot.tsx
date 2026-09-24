import { t } from "ttag";

import S from "./LiveDot.module.css";

export function LiveDot() {
  return <span className={S.liveDot} aria-label={t`Updates live`} />;
}
