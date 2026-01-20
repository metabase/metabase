import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserCanWriteMeasures } from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Table } from "metabase-types/api";

import {
  EntityList,
  EntityListItem,
} from "../../../common/components/EntityList";

type TableMeasuresProps = {
  table: Table;
};

export function TableMeasures({ table }: TableMeasuresProps) {
  const canCreateMeasure = useSelector(getUserCanWriteMeasures);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const measures = table.measures ?? [];
  let newButtonLabel: string | undefined;
  let newButtonUrl: string | undefined;

  if (canCreateMeasure && !remoteSyncReadOnly) {
    newButtonLabel = t`New measure`;
    newButtonUrl = Urls.dataStudioPublishedTableMeasureNew(table.id);
  }

  return (
    <Flex direction="column" flex={1}>
      <EntityList
        items={measures}
        title={t`Measures`}
        emptyState={{
          icon: "sum",
          title: t`No measures yet`,
          message: t`Create a measure to define aggregations for this table.`,
        }}
        newButtonLabel={newButtonLabel}
        newButtonUrl={newButtonUrl}
        renderItem={(measure) => (
          <EntityListItem
            key={measure.id}
            name={measure.name}
            description={measure.definition_description}
            icon="sum"
            href={Urls.dataStudioPublishedTableMeasure(table.id, measure.id)}
          />
        )}
      />
    </Flex>
  );
}
