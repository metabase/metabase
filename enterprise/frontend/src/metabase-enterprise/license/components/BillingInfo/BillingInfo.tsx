import type { BillingInfo as IBillingInfo } from "metabase-types/api";

import { BillingGoToStore } from "./BillingGoToStore";
import { BillingInfoError } from "./BillingInfoError";
import { BillingInfoNotStoreManaged } from "./BillingInfoNotStoreManaged";
import { BillingInfoTable } from "./BillingInfoTable";

interface BillingInfoProps {
  isStoreManagedBilling: boolean;
  billingInfo?: IBillingInfo | null;
  hasToken: boolean;
  error: boolean;
}

export function BillingInfo({
  isStoreManagedBilling,
  billingInfo,
  hasToken,
  error,
}: BillingInfoProps) {
  if (error) {
    return <BillingInfoError />;
  }

  if (!hasToken) {
    return <BillingGoToStore />;
  }

  if (!isStoreManagedBilling) {
    return <BillingInfoNotStoreManaged />;
  }

  if (!billingInfo || !billingInfo.content || !billingInfo.content.length) {
    return <BillingGoToStore />;
  }

  return <BillingInfoTable billingInfo={billingInfo} />;
}
