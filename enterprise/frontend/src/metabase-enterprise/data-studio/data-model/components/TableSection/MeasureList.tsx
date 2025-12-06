import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon, Stack } from "metabase/ui";
import type { Measure, TableId } from "metabase-types/api";

import { MeasureItem } from "./MeasureItem";

type MeasureListProps = {
  measures: Measure[];
  tableId: TableId;
};

export function MeasureList({ measures, tableId }: MeasureListProps) {
  return (
    <Stack gap="md">
      <Group gap="md" justify="flex-start" wrap="nowrap">
        <Button
          component={ForwardRefLink}
          to={Urls.newDataStudioMeasure(tableId)}
          h={32}
          px="sm"
          py="xs"
          size="xs"
          leftSection={<Icon name="add" />}
        >{t`New measure`}</Button>
      </Group>

      {measures.length === 0 ? (
        <EmptyState
          illustrationElement={<Icon name="sum" size={32} c="text-secondary" />}
          title={t`No measures yet`}
          message={t`Create a measure to define a reusable aggregation for this table.`}
        />
      ) : (
        <Stack gap="sm" role="list">
          {measures.map((measure) => (
            <MeasureItem
              key={measure.id}
              measure={measure}
              href={Urls.dataStudioMeasure(measure.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
