import { jt, t } from "ttag";

export const NormalAlertTip = () => (
  <div>{jt`${(
    <strong key="alert-tip">{t`Tip`}:</strong>
  )} This kind of alert is most useful when your saved question doesn’t ${(
    <em key="alert-tip-em">{t`usually`}</em>
  )} return any results, but you want to know when it does.`}</div>
);
