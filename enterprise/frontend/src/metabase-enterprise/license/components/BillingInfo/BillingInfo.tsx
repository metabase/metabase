import type { BillingInfo as IBillingInfo } from "metabase-types/api";
import { BillingInfoError } from "./BillingInfoError";
import { BillingInfoNotStoreManaged } from "./BillingInfoNotStoreManaged";
import { BillingInfoTable } from "./BillingInfoTable";

interface BillingInfoProps {
  isStoreManagedBilling: boolean;
  billingInfo?: IBillingInfo | null;
  error: boolean;
}

export function BillingInfo({
  isStoreManagedBilling,
  billingInfo,
  error,
}: BillingInfoProps) {
  if (error) {
    return <BillingInfoError />;
  }

  if (!isStoreManagedBilling) {
    return <BillingInfoNotStoreManaged />;
  }

  return <BillingInfoTable billingInfo={billingInfo} />;
}
