import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useMetadataProvider } from "metabase/metadata-store";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { Button, Icon, Popover } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  type AnalysisFilters,
  hasFilters,
  readFilterQuery,
  withFilterQuery,
} from "../../filters";
import type { SettingWidgetProps } from "../../settings/types";
import { useTableQuery } from "../events/use-table-query";

type FilterButtonProps = SettingWidgetProps<AnalysisFilters> & {
  table?: Table;
};

/** The same picker as the query builder's Filter button, on the event table. */
export const FilterButton = ({ value, onChange, table }: FilterButtonProps) => {
  const [isOpened, { close, toggle }] = useDisclosure();
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const tableQuery = useTableQuery(table);
  const query = readFilterQuery(metadataProvider, value) ?? tableQuery;

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <Button
          variant="default"
          leftSection={
            <Icon name={hasFilters(value) ? "filter_plus" : "filter"} />
          }
          disabled={query === undefined}
          onClick={toggle}
        >
          {t`Filter`}
        </Button>
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
