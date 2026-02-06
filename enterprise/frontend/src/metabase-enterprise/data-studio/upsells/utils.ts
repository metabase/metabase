import { t } from "ttag";

export type BillingPeriod = "monthly" | "yearly";

export const getCostDescription = (
  billingPeriod: BillingPeriod,
  isTrialFlow: boolean,
  formattedTrialEndDate?: string,
) => {
  if (isTrialFlow && formattedTrialEndDate) {
    return billingPeriod === "monthly"
      ? t`New total monthly cost starting ${formattedTrialEndDate}`
      : t`New total yearly cost starting ${formattedTrialEndDate}`;
  }

  return billingPeriod === "monthly"
    ? t`New total monthly cost`
    : t`New total yearly cost`;
};
