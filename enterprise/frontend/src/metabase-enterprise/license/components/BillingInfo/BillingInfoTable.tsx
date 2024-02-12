import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SectionHeader } from "metabase/admin/settings/components/SettingsLicense";
import { Text } from "metabase/ui";
import type { BillingInfoLineItem, BillingInfo } from "metabase-types/api";

import { StillNeedHelp } from "../StillNeedHelp";

import {
  BillingInfoCard,
  BillingInfoRowContainer,
  BillingInternalLink,
  BillingExternalLink,
  BillingExternalLinkIcon,
} from "./BillingInfo.styled";
import {
  getBillingInfoId,
  isSupportedLineItem,
  formatBillingValue,
  isUnsupportedInternalLink,
  internalLinkMap,
} from "./utils";

const BillingInfoValue = ({
  lineItem,
  ...props
}: {
  lineItem: BillingInfoLineItem;
}) => {
  const formattedValue = formatBillingValue(lineItem);

  if (lineItem.display === "value") {
    return (
      <Text fw="bold" color="currentColor" {...props}>
        {formattedValue}
      </Text>
    );
  }

  if (lineItem.display === "internal-link") {
    return (
      <BillingInternalLink
        to={internalLinkMap[lineItem.link]}
        data-testid="test-link"
        {...props}
      >
        <Text fw="bold" color="currentColor">
          {formattedValue}
        </Text>
      </BillingInternalLink>
    );
  }

  if (lineItem.display === "external-link") {
    return (
      <BillingExternalLink href={lineItem.link} {...props}>
        <Text fw="bold" color="currentColor">
          {formattedValue}
        </Text>
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
  ...props
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

  const id = getBillingInfoId(lineItem);

  // ErrorBoundary serves as an extra guard in case billingInfo schema
  // changes in a way the current application doesn't expect
  return (
    <ErrorBoundary errorComponent={() => null}>
      <BillingInfoRowContainer extraPadding={extraPadding} {...props}>
        <Text
          color="text-md"
          maw="15rem"
          data-testid={`billing-info-key-${id}`}
        >
          {lineItem.name}
        </Text>
        <BillingInfoValue
          lineItem={lineItem}
          data-testid={`billing-info-value-${id}`}
        />
      </BillingInfoRowContainer>
    </ErrorBoundary>
  );
}

export const BillingInfoTable = ({
  billingInfo,
}: {
  billingInfo: BillingInfo;
}) => {
  return (
    <>
      <SectionHeader>{t`Billing`}</SectionHeader>
      <BillingInfoCard flat>
        {billingInfo.content?.map((lineItem, index, arr) => (
          <BillingInfoRow
            key={lineItem.name}
            lineItem={lineItem}
            extraPadding={arr.length === index + 1}
          />
        ))}
      </BillingInfoCard>
      <StillNeedHelp />
    </>
  );
};
