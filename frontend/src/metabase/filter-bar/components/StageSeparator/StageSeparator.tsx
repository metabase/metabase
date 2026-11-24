import { t } from "ttag";

import S from "./StageSeparator.module.css";

export const StageSeparator = () => (
  <span className={S.separator}>{t`then`}</span>
);
