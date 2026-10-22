import { t } from "ttag";

import S from "./MetabotResponseLoader.module.css";

export const MetabotResponseLoader = () => (
  <div
    className={S.root}
    role="status"
    aria-label={t`Loading`}
    data-testid="metabot-response-loader"
  >
    <div className={S.dots} />
  </div>
);
