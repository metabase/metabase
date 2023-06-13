import { forwardRef } from "react";
import { t } from "ttag";
import Tooltip from "metabase/core/components/Tooltip";
import { AddAggregationButtonRoot } from "./AddAggregationButton.styled";

interface AddAggregationButtonProps {
  hasLabel: boolean;
  onClick: () => void;
}

export const AddAggregationButton = forwardRef<
  HTMLButtonElement,
  AddAggregationButtonProps
>(function AddAggregationButton(
  { hasLabel, onClick }: AddAggregationButtonProps,
  ref,
) {
  return (
    <Tooltip tooltip={t`Add a metric`} isEnabled={!hasLabel}>
      <AddAggregationButtonRoot
        icon="add"
        borderless
        onlyIcon={!hasLabel}
        onClick={onClick}
        aria-label={t`Add aggregation`}
        data-testid="add-aggregation-button"
        ref={ref}
      >
        {hasLabel ? t`Add a metric` : null}
      </AddAggregationButtonRoot>
    </Tooltip>
  );
});
