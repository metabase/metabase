import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMeasureCreateStarted } from "metabase/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/data-studio/selectors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon, Stack } from "metabase/ui";
import type { ConcreteTableId, Table } from "metabase-types/api";

import S from "../../TableSection.module.css";
import { MeasureItem } from "../MeasureItem";

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
  const onNewMeasureClick = () => {
    trackMeasureCreateStarted(table.id as ConcreteTableId);
  };
  const newMeasureUrl = Urls.newDataStudioDataModelMeasure({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  });

  return (
    <Stack gap="md" data-testid="table-measures-page">
      {canWriteMeasures && (
        <Group gap="md" justify="flex-start" wrap="nowrap">
          <Button
            component={ForwardRefLink}
            h={32}
            leftSection={<Icon name="add" />}
            onAuxClick={onNewMeasureClick}
            onClickCapture={onNewMeasureClick}
            px="sm"
            py="xs"
            size="xs"
            to={newMeasureUrl}
          >
            {t`New measure`}
          </Button>
        </Group>
      )}

      {measures.length === 0 ? (
        <EmptyState
          className={S.EmptyState}
          spacing="sm"
          illustrationElement={<Icon name="ruler" size={32} c="text-secondary" />}
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
