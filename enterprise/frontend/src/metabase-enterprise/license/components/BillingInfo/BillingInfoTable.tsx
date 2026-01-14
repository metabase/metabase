import { forwardRef } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useSetting } from "metabase/common/hooks";
import { Icon, Text } from "metabase/ui";
import type { BillingInfo, BillingInfoLineItem } from "metabase-types/api";

import { StillNeedHelp } from "../StillNeedHelp";

import {
  BillingExternalLink,
  BillingInfoCard,
  BillingInfoRowContainer,
  BillingInternalLink,
} from "./BillingInfo.styled";
import {
  formatBillingValue,
  getBillingInfoId,
  internalLinkMap,
  isSupportedLineItem,
  isUnsupportedInternalLink,
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
        href={internalLinkMap[lineItem.link]}
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
        <Icon ml="sm" size="16" name="external" />
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
    <ErrorBoundary errorComponent={EmptyErrorComponent}>
      <BillingInfoRowContainer extraPadding={extraPadding} {...props}>
        <Text
          c="text-secondary"
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
  const airgap_enabled = useSetting("airgap-enabled");
  return (
    <>
      <SettingHeader id="billing" title={t`Billing`} />
      <BillingInfoCard flat>
        {billingInfo.content?.map((lineItem, index, arr) => (
          <BillingInfoRow
            key={lineItem.name}
            lineItem={lineItem}
            extraPadding={arr.length === index + 1}
          />
        ))}
      </BillingInfoCard>
      {airgap_enabled && <StillNeedHelp />}
    </>
  );
};

const EmptyErrorComponent = forwardRef(function EmptyErrorComponent() {
  return null;
});
