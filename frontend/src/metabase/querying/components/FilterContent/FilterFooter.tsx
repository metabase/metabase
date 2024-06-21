import { t } from "ttag";

import { Button } from "metabase/ui";

type FilterFooterProps = {
  canRemoveFilters: boolean;
  onClearFilters: () => void;
  changed: boolean;
  onApplyFilters: () => void;
};

export const FilterFooter = ({
  canRemoveFilters,
  changed,
  onApplyFilters,
  onClearFilters,
}: FilterFooterProps) => (
  <>
    <Button
      variant="subtle"
      color="text-medium"
      disabled={!canRemoveFilters}
      onClick={onClearFilters}
    >
      {t`Clear all filters`}
    </Button>
    <Button
      variant="filled"
      disabled={!changed}
      data-testid="apply-filters"
      onClick={onApplyFilters}
    >
      {t`Apply filters`}
    </Button>
  </>
);
