import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMeasureCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Button, type ButtonProps, Icon, Stack, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId, Table } from "metabase-types/api";

import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import S from "../TableSection.module.css";

import { MeasureItem } from "./MeasureItem";

type MeasureListProps = {
  table: Table;
};

export function MeasureList({ table }: MeasureListProps) {
  const measures = table.measures ?? [];
  const [query, setQuery] = useState("");
  const matchingMeasures = measures.filter((measure) =>
    matchesListSearch(query, measure.name),
  );
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
    // Unjustified type cast. FIXME
    trackMeasureCreateStarted(table.id as ConcreteTableId);
  };
  const newMeasureUrl = Urls.newDataStudioDataModelMeasure({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  });

  const renderNewMeasureButton = (variant?: ButtonProps["variant"]) =>
    canWriteMeasures && (
      <Button
        variant={variant}
        component={ForwardRefLink}
        leftSection={<Icon name="add" />}
        onAuxClick={onNewMeasureClick}
        onClickCapture={onNewMeasureClick}
        to={newMeasureUrl}
      >
        {t`New measure`}
      </Button>
    );

  // The action sits under the message, centered and blue, as the next step
  if (measures.length === 0) {
    return (
      <Stack
        align="center"
        gap="lg"
        mt={80}
        className={S.EmptyState}
        data-testid="table-measures-page"
      >
        <EmptyState
          spacing="sm"
          illustrationElement={
            <Icon name="ruler" size={32} c="text-secondary" />
          }
          title={t`No measures yet`}
          message={t`Create a measure to define a reusable aggregation for this table.`}
        />
        {renderNewMeasureButton("filled")}
      </Stack>
    );
  }

  return (
    <Stack gap="lg" data-testid="table-measures-page">
      <ListSearchBar
        value={query}
        placeholder={t`Search measures`}
        onChange={setQuery}
      >
        {renderNewMeasureButton()}
      </ListSearchBar>

      {matchingMeasures.length === 0 ? (
        <ListSearchEmptyState>{t`No measures match "${query}"`}</ListSearchEmptyState>
      ) : (
        <Stack gap={rem(12)} role="list">
          {matchingMeasures.map((measure) => (
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
