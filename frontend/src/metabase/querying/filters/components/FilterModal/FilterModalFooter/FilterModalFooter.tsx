import { t } from "ttag";

import { Button } from "metabase/ui";

type FilterModalFooterProps = {
  canRemoveFilters: boolean;
  onClearFilters: () => void;
  isChanged: boolean;
  onApplyFilters: () => void;
};

export const FilterModalFooter = ({
  canRemoveFilters,
  isChanged,
  onApplyFilters,
  onClearFilters,
}: FilterModalFooterProps) => (
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
      disabled={!isChanged}
      data-testid="apply-filters"
      onClick={onApplyFilters}
    >
      {t`Apply filters`}
    </Button>
  </>
);
