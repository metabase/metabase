import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon, Stack } from "metabase/ui";
import { getUserCanWriteMeasures } from "metabase-enterprise/data-studio/selectors";
import type { Table } from "metabase-types/api";

import { MeasureItem } from "./MeasureItem";
import S from "./TableSection.module.css";

type MeasureListProps = {
  table: Table;
};

export function MeasureList({ table }: MeasureListProps) {
  const measures = table.measures ?? [];
  const getMeasureHref = (measureId: number) =>
    Urls.dataStudioDataModelMeasure({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      measureId,
    });
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );

  return (
    <Stack gap="md" data-testid="table-measures-page">
      {canWriteMeasures && (
        <Group gap="md" justify="flex-start" wrap="nowrap">
          <Button
            component={ForwardRefLink}
            to={Urls.newDataStudioDataModelMeasure({
              databaseId: table.db_id,
              schemaName: table.schema,
              tableId: table.id,
            })}
            h={32}
            px="sm"
            py="xs"
            size="xs"
            leftSection={<Icon name="add" />}
          >{t`New measure`}</Button>
        </Group>
      )}

      {measures.length === 0 ? (
        <EmptyState
          className={S.EmptyState}
          spacing="sm"
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
              href={getMeasureHref(measure.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
