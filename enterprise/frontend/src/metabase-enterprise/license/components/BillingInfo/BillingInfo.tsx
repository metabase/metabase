import { t } from "ttag";
import ErrorBoundary from "metabase/ErrorBoundary";
import type {
  BillingInfoLineItem,
  BillingInfo as IBillingInfo,
} from "metabase-types/api";
import { Text, Anchor } from "metabase/ui";
import {
  BillingErrorMessage,
  BillingInfoCard,
  BillingInfoRowContainer,
  BillingInfoKey,
  BillingInfoTextValue,
  BillingInternalLink,
  BillingExternalLink,
  BillingExternalLinkIcon,
} from "./BillingInfo.styled";
import { isSupportedLineItem, formatBillingValue } from "./utils";

interface BillingInfoProps {
  isStoreManagedBilling: boolean;
  billingInfo?: IBillingInfo;
  error: string | undefined;
}

const BillingInfoValue = ({ lineItem }: { lineItem: BillingInfoLineItem }) => {
  const formattedValue = formatBillingValue(lineItem);

  if (!lineItem.display || lineItem.display === "value") {
    return <BillingInfoTextValue>{formattedValue}</BillingInfoTextValue>;
  }

  if (lineItem.display === "internal-link") {
    return (
      <BillingInternalLink to={lineItem.link}>
        <BillingInfoTextValue>{formattedValue}</BillingInfoTextValue>
      </BillingInternalLink>
    );
  }

  if (lineItem.display === "external-link") {
    return (
      <BillingExternalLink href={lineItem.link}>
        <BillingInfoTextValue>{formattedValue}</BillingInfoTextValue>
        <BillingExternalLinkIcon size="16" name="external" />
      </BillingExternalLink>
    );
  }

  // do not display items with unknown display or value types
  return null;
};

function BillingInfoRow({
  lineItem,
  extraPadding,
}: {
  lineItem: BillingInfoLineItem;
  extraPadding: boolean;
}) {
  // avoid rendering the entire row if we can't format/display the value
  // ErrorBoundary serves as an extra guard in case billingInfo schema
  // changes in a way the current application doesn't expect
  if (!isSupportedLineItem(lineItem)) {
    return null;
  }

  return (
    <ErrorBoundary errorComponent={() => null}>
      <BillingInfoRowContainer extraPadding={extraPadding}>
        <BillingInfoKey>{lineItem.name}</BillingInfoKey>
        <BillingInfoValue lineItem={lineItem} />
      </BillingInfoRowContainer>
    </ErrorBoundary>
  );
}

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
          lineItem={lineItem}
          extraPadding={billingInfo.length === index + 1}
        />
      ))}
    </BillingInfoCard>
  );
}
