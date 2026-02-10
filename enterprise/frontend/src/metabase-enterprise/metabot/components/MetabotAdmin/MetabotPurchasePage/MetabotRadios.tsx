import { Fragment, type ReactElement, useState } from "react";
import { t } from "ttag";

import { FormRadioGroup } from "metabase/forms";
import { Box, Card, Divider, Flex, Radio, Text } from "metabase/ui";

import type { IMetabotRadioProps, IMetabotRadiosProps } from "./types";

function MetabotRadio({
  selected,
  value,
  title,
  description,
  price,
}: IMetabotRadioProps): ReactElement {
  return (
    <Box bg={selected ? "background-brand" : undefined} p="md" w="100%">
      <Radio
        value={value}
        label={
          <Flex
            align="flex-start"
            direction={{ base: "column", sm: "row" }}
            justify="space-between"
            wrap="nowrap"
            w="100%"
          >
            <Text fw="bold" miw="35%" ta="left">
              {title}
            </Text>

            <Text ta="left">{description}</Text>

            <Text fw="bold" ta={{ base: "left", sm: "right" }}>
              {price}
            </Text>
          </Flex>
        }
        w="100%"
      />
    </Box>
  );
}

export function MetabotRadios({
  quantity,
  tiers,
  billingPeriodMonths,
}: IMetabotRadiosProps): ReactElement {
  const [selectedQuantity, setSelectedQuantity] = useState(quantity);
  const billingPeriodLabel = billingPeriodMonths === 1 ? t`month` : t`year`;

  return (
    <FormRadioGroup
      defaultValue={selectedQuantity}
      name="quantity"
      labelElement="div"
      onChange={(value) => setSelectedQuantity(value)}
      w="100%"
    >
      <Card withBorder p={0} w="100%">
        {tiers.map(({ id, name, quantity, price }, index) => (
          <Fragment key={id}>
            {index > 0 && <Divider />}

            <MetabotRadio
              selected={`${quantity}` === selectedQuantity}
              value={`${quantity}`}
              title={name}
              description={t`up to ${quantity} requests/${billingPeriodLabel}`}
              price={`$${price}/${billingPeriodLabel}`}
            />
          </Fragment>
        ))}
      </Card>
    </FormRadioGroup>
  );
}
