import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import { Badge, Button, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AddFilterPopover } from "../AddFilterPopover";

const STAGE_INDEX = -1;

type FiltersButtonProps = {
  /** The query the filters are on. Undefined until it's known. */
  query: Lib.Query | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  /** Gets the query with its first filter added. */
  onAdd: (query: Lib.Query) => void;
};

const getLabel = (count: number) =>
  count > 0
    ? ngettext(msgid`${count} filter`, `${count} filters`, count)
    : t`Filters`;

/**
 * Opens the filter picker while there are no filters. Once there are, it shows
 * and hides the filter row, with a badge for how many there are.
 */
export const FiltersButton = ({
  query,
  isExpanded,
  onToggle,
  onAdd,
}: FiltersButtonProps) => {
  const [isPickerOpened, { close: closePicker, toggle: togglePicker }] =
    useDisclosure(false);
  const count =
    query !== undefined ? Lib.filters(query, STAGE_INDEX).length : 0;
  const hasFilters = count > 0;

  return (
    <AddFilterPopover
      query={query}
      isOpened={isPickerOpened}
      onChange={onAdd}
      onClose={closePicker}
    >
      <Tooltip label={t`Filters`} disabled={isPickerOpened}>
        <Button
          variant="default"
          px="sm"
          aria-label={getLabel(count)}
          aria-pressed={hasFilters ? isExpanded : undefined}
          disabled={query === undefined}
          rightSection={
            hasFilters && (
              <Badge
                size="xs"
                variant="filled"
                color="neutral"
                bg={isExpanded ? "core-filter-strong" : undefined}
                c={isExpanded ? "text-primary-inverse" : undefined}
                style={{ cursor: "inherit" }}
                data-testid="filters-count"
              >
                {count}
              </Badge>
            )
          }
          onClick={hasFilters ? onToggle : togglePicker}
        >
          <Icon name="filter" />
        </Button>
      </Tooltip>
    </AddFilterPopover>
  );
};
