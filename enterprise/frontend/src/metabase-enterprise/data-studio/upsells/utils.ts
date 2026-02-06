import { t } from "ttag";

export type BillingPeriod = "monthly" | "yearly";

export const getCostDescription = (
  billingPeriod: BillingPeriod,
  isTrialFlow: boolean,
  formattedTrialEndDate?: string,
) => {
  if (isTrialFlow && formattedTrialEndDate) {
    return billingPeriod === "monthly"
      ? t`Additional monthly cost starting ${formattedTrialEndDate}`
      : t`Additional yearly cost starting ${formattedTrialEndDate}`;
  }

  return billingPeriod === "monthly"
    ? t`Additional monthly cost`
    : t`Additional yearly cost`;
};
