import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { Icon, Popover, UnstyledButton } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  type AnalysisFilters,
  readFilterQuery,
  withFilterQuery,
} from "../filters";
import type { SettingWidgetProps } from "../settings/types";

import S from "./AddFilterButton.module.css";
import { useFilterCount } from "./FilterPills";
import { useTableQuery } from "./events/use-table-query";

type AddFilterButtonProps = SettingWidgetProps<AnalysisFilters> & {
  table?: Table;
};

/**
 * The end of the filter row: a round + after the filters, or, while there are
 * none, a "New filter" placeholder that opens its column picker right away.
 * Same picker as the query builder's, on the event table.
 */
export const AddFilterButton = ({
  value,
  onChange,
  table,
}: AddFilterButtonProps) => {
  const isEmpty = useFilterCount(value, table) === 0;
  // The row mounts when it's shown, so an empty one opens straight onto it.
  const [isOpened, { close, toggle }] = useDisclosure(isEmpty);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const tableQuery = useTableQuery(table);
  const query = readFilterQuery(metadataProvider, value) ?? tableQuery;

  return (
    <Popover
      opened={isOpened && query !== undefined}
      position="bottom-start"
      onDismiss={close}
    >
      <Popover.Target>
        {isEmpty ? (
          <FilterPill onClick={toggle}>{t`New filter`}</FilterPill>
        ) : (
          <UnstyledButton
            className={S.add}
            aria-label={t`Add a filter`}
            onClick={toggle}
          >
            <Icon name="add" size={12} />
          </UnstyledButton>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        {query !== undefined && (
          <MultiStageFilterPicker
            query={query}
            canAppendStage={false}
            onChange={(newQuery) => onChange(withFilterQuery(value, newQuery))}
            onClose={close}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
};
