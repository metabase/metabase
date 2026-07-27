import { forwardRef } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import { Box, Card, Flex, Icon, Text } from "metabase/ui";
import type { BillingInfo, BillingInfoLineItem } from "metabase-types/api";

import { StillNeedHelp } from "../StillNeedHelp";

import S from "./BillingInfo.module.css";
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
      <Text fw="bold" color="currentColor" ta="right" {...props}>
        {formattedValue}
      </Text>
    );
  }

  if (lineItem.display === "internal-link") {
    return (
      <Link
        className={S.link}
        to={internalLinkMap[lineItem.link]}
        href={internalLinkMap[lineItem.link]}
        data-testid="test-link"
        {...props}
      >
        <Text fw="bold" color="currentColor">
          {formattedValue}
        </Text>
      </Link>
    );
  }

  if (lineItem.display === "external-link") {
    return (
      <ExternalLink className={S.link} href={lineItem.link} {...props}>
        <Text fw="bold" color="currentColor">
          {formattedValue}
        </Text>
        <Icon ml="sm" size="16" name="external" />
      </ExternalLink>
    );
  }

  // do not display items with unknown display or value types
  return null;
};

function BillingInfoRow({
  lineItem,
  ...props
}: {
  lineItem: BillingInfoLineItem;
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
      <Flex
        className={S.row}
        align="center"
        justify="space-between"
        gap="lg"
        px="lg"
        py="md"
        {...props}
      >
        <Text
          className={S.label}
          c="text-secondary"
          data-testid={`billing-info-key-${id}`}
        >
          {lineItem.name}
        </Text>
        <BillingInfoValue
          lineItem={lineItem}
          data-testid={`billing-info-value-${id}`}
        />
      </Flex>
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
    <Box>
      <SettingHeader id="billing" title={t`Billing`} />
      <Card mt="md" p={0} radius="md" shadow="none" withBorder>
        {billingInfo.content?.map((lineItem) => (
          <BillingInfoRow key={lineItem.name} lineItem={lineItem} />
        ))}
      </Card>
      {airgap_enabled && <StillNeedHelp />}
    </Box>
  );
};

const EmptyErrorComponent = forwardRef(function EmptyErrorComponent() {
  return null;
});
