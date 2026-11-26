import { t } from "ttag";

import { Flex, Icon, Kbd, Text } from "metabase/ui";

import { PAREN_TEXT } from "../../model";

const OPERATORS = ["AND", "OR", PAREN_TEXT.open, PAREN_TEXT.close];

export const LogicOperatorsHint = () => (
  <Flex align="center" justify="space-between" py="sm" px="xl">
    <Flex align="center" gap="sm" c="text-secondary">
      <Icon name="info" size={12} />
      <Text fz="sm" lh={1.15} c="inherit">
        {t`Logic operators available`}
      </Text>
    </Flex>
    <Flex align="center" gap="3px">
      {OPERATORS.map((operator, index) => (
        <Flex key={operator} align="flex-end">
          <Kbd fz="sm" c="text-primary">
            {operator}
          </Kbd>
          {index < OPERATORS.length - 1 && (
            <Text fz="sm" lh={1.15} c="text-secondary">
              ,
            </Text>
          )}
        </Flex>
      ))}
    </Flex>
  </Flex>
);
