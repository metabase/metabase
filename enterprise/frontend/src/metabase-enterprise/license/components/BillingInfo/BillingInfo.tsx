import { t } from "ttag";
import type {
  BillingInfoLineItem,
  BillingInfo as IBillingInfo,
} from "metabase-types/api";
import { Text, Anchor } from "metabase/ui";
import {
  BillingErrorMessage,
  BillingInfoCard,
  BillingInfoRow,
  BillingInfoKey,
  BillingInfoPrimitiveValue,
  BillingExternalLink,
  BillingExternalLinkIcon,
} from "./BillingInfo.styled";

interface BillingInfoProps {
  isStoreManagedBilling: boolean;
  billingInfo?: IBillingInfo;
  error: string | undefined;
}

const BillingInfoValue = ({ lineItem }: { lineItem: BillingInfoLineItem }) => {
  if (lineItem.type === "link") {
    return (
      <BillingExternalLink href={lineItem.value}>
        {lineItem.title}
        <BillingExternalLinkIcon size="16" name="external" />
      </BillingExternalLink>
    );
  }

  return (
    <BillingInfoPrimitiveValue type={lineItem.type}>
      {lineItem.value}
    </BillingInfoPrimitiveValue>
  );
};

export function BillingInfo({
  isStoreManagedBilling,
  billingInfo = [],
  error,
}: BillingInfoProps) {
  if (error) {
    return <BillingErrorMessage>{error}</BillingErrorMessage>;
  }

  if (!isStoreManagedBilling) {
    <Text color="text-medium">
      {t`To manage your billing preferences, please email `}
      <Anchor href="mailto:billing@metabase.com">billing@metabase.com</Anchor>
    </Text>;
  }

  return (
    <BillingInfoCard flat>
      {billingInfo.map((lineItem, index) => (
        <BillingInfoRow
          key={lineItem.name}
          extraPadding={billingInfo.length === index + 1}
        >
          <BillingInfoKey>{lineItem.name}</BillingInfoKey>
          <BillingInfoValue lineItem={lineItem} />
        </BillingInfoRow>
      ))}
    </BillingInfoCard>
  );
}
