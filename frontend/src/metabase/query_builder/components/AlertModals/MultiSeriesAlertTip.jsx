import { jt, t } from "ttag";

export const MultiSeriesAlertTip = () => (
  <div>{jt`${(
    <strong>{t`Heads up`}:</strong>
  )} Goal-based alerts aren't yet supported for charts with more than one line, so this alert will be sent whenever the chart has ${(
    <em>{t`results`}</em>
  )}.`}</div>
);
