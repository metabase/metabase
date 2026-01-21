import type { MouseEventHandler } from "react";
import { t } from "ttag";

import { Box, Button, Icon, Stack, Text } from "metabase/ui";

import { RulePreview } from "./RulePreview";
import type { NumberFormattingSetting } from "./types";

export interface RuleListingProps {
  rules: NumberFormattingSetting[];
  onEdit: (index: number) => void;
  onAdd: MouseEventHandler<HTMLButtonElement>;
  onRemove: (index: number) => void;
}

export const RuleListing = ({
  rules,
  onEdit,
  onAdd,
  onRemove,
}: RuleListingProps) => (
  <Stack gap="1.5rem" px="2rem" py="1rem">
    <Box>
      <Text fw="bold" mb="sm">{t`Conditional formatting`}</Text>
      <Text c="text-medium" fz="sm">
        {t`You can add rules to make the number change color if it meets certain conditions.`}
      </Text>
    </Box>
    <Box ml="-0.5rem">
      <Button
        variant="subtle"
        color="brand"
        onClick={onAdd}
        leftSection={<Icon name="add" />}
      >
        {t`Add a rule`}
      </Button>
    </Box>
    {rules.length > 0 && (
      <>
        <Box>
          <Text fw="bold" mb="sm">{t`Rules will be applied in this order`}</Text>
          <Text c="text-medium" fz="sm">{t`The first matching rule will be used.`}</Text>
        </Box>
        <Stack gap="sm">
          {rules.map((rule, index) => (
            <RulePreview
              key={index}
              rule={rule}
              onClick={() => onEdit(index)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </Stack>
      </>
    )}
  </Stack>
);
