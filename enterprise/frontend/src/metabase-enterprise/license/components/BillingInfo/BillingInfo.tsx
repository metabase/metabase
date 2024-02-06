import { t } from "ttag";
import ErrorBoundary from "metabase/ErrorBoundary";
import type {
  BillingInfoLineItem,
  BillingInfo as IBillingInfo,
} from "metabase-types/api";
import { Text, Anchor } from "metabase/ui";
import { SectionHeader } from "metabase/admin/settings/components/SettingsLicense";
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
import {
  isSupportedLineItem,
  formatBillingValue,
  isUnsupportedInternalLink,
  internalLinkMap,
} from "./utils";

interface BillingInfoProps {
  isStoreManagedBilling: boolean;
  billingInfo?: IBillingInfo | null;
  error: string | undefined;
}

const BillingInfoValue = ({ lineItem }: { lineItem: BillingInfoLineItem }) => {
  const formattedValue = formatBillingValue(lineItem);

  if (lineItem.display === "value") {
    return <BillingInfoTextValue>{formattedValue}</BillingInfoTextValue>;
  }

  if (lineItem.display === "internal-link") {
    return (
      <BillingInternalLink to={internalLinkMap[lineItem.link]}>
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
  if (!isSupportedLineItem(lineItem)) {
    return null;
  }

  // avoid rendering internal links where we do not have the ability
  // to link the user to the appropriate page due to instance being
  // an older version of MB
  if (isUnsupportedInternalLink(lineItem)) {
    return null;
  }

  // ErrorBoundary serves as an extra guard in case billingInfo schema
  // changes in a way the current application doesn't expect
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
  billingInfo,
  error,
}: BillingInfoProps) {
  if (error) {
    return (
      <>
        <SectionHeader>{t`Billing`}</SectionHeader>
        <BillingErrorMessage>{error}</BillingErrorMessage>
        <BillingErrorMessage>
          {t`To manage your billing preferences, please email `}
          <Anchor href="mailto:billing@metabase.com">
            billing@metabase.com
          </Anchor>
        </BillingErrorMessage>
      </>
    );
  }

  if (!isStoreManagedBilling) {
    return (
      <>
        <SectionHeader>{t`Billing`}</SectionHeader>
        <Text color="text-medium">
          {t`To manage your billing preferences, please email `}
          <Anchor href="mailto:billing@metabase.com">
            billing@metabase.com
          </Anchor>
        </Text>
      </>
    );
  }

  if (!billingInfo || !billingInfo.content || !billingInfo.content.length) {
    return null;
  }

  return (
    <>
      <SectionHeader>{t`Billing`}</SectionHeader>
      <BillingInfoCard flat>
        {billingInfo.content.map((lineItem, index, arr) => (
          <BillingInfoRow
            key={lineItem.name}
            lineItem={lineItem}
            extraPadding={arr.length === index + 1}
          />
        ))}
      </BillingInfoCard>
    </>
  );
}
