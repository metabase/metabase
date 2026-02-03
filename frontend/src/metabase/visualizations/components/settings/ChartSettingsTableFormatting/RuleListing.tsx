import type { MouseEventHandler } from "react";
import { t } from "ttag";

import { Box, Button, Icon, Stack, Text, Title } from "metabase/ui";

import {
  SortableRuleList,
  type SortableRuleListProps,
} from "./SortableRuleList";

export const RuleListing = ({
  rules,
  cols,
  onEdit,
  onAdd,
  onRemove,
  onMove,
}: SortableRuleListProps & {
  onAdd: MouseEventHandler<HTMLButtonElement>;
}) => (
  <Stack gap="md">
    <Stack gap="sm">
      <Text fw="bold" fz="lg">{t`Conditional formatting`}</Text>
      <Text lh="normal">
        {t`You can add rules to make the cells in this table change color if
    they meet certain conditions.`}
      </Text>
    </Stack>
    <Box>
      <Button
        variant="subtle"
        color="text-primary"
        onClick={onAdd}
        leftSection={<Icon name="add" />}
      >
        {t`Add a rule`}
      </Button>
    </Box>
    {rules.length > 0 && (
      <>
        <Stack gap="sm">
          <Title
            order={2}
            fw="bold"
            fz="lg"
          >{t`Rules will be applied in this order`}</Title>
          <Text lh="normal">{t`Click and drag to reorder.`}</Text>
        </Stack>
        <SortableRuleList
          rules={rules}
          cols={cols}
          onEdit={onEdit}
          onRemove={onRemove}
          onMove={onMove}
        />
      </>
    )}
  </Stack>
);
