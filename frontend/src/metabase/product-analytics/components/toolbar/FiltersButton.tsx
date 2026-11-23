import { msgid, ngettext, t } from "ttag";

import { Badge, Button, Icon, Tooltip } from "metabase/ui";

type FiltersButtonProps = {
  /** Undefined until the analysis's filters are known. */
  count: number | undefined;
  isExpanded: boolean;
  onClick: () => void;
};

const getLabel = (count: number | undefined) =>
  count !== undefined && count > 0
    ? ngettext(msgid`${count} filter`, `${count} filters`, count)
    : t`Filters`;

/** Shows and hides the filter row, with a badge for how many filters there are. */
export const FiltersButton = ({
  count,
  isExpanded,
  onClick,
}: FiltersButtonProps) => (
  <Tooltip label={t`Filters`}>
    <Button
      variant="default"
      px="sm"
      aria-label={getLabel(count)}
      aria-pressed={isExpanded}
      disabled={count === undefined}
      rightSection={
        count !== undefined &&
        count > 0 && (
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
      onClick={onClick}
    >
      <Icon name="filter" />
    </Button>
  </Tooltip>
);
