import { useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { SummarizePicker } from "embedding-sdk/components/private/InteractiveQuestion/components/Summarize/SummarizePicker";
import {
  MultiStepPopover,
  type MultiStepState,
} from "embedding-sdk/components/private/util/MultiStepPopover";
import type { PopoverProps } from "metabase/ui";

import { ToolbarButton } from "../../util/ToolbarButton";
import { SummarizeBadgeList } from "../SummarizeBadgeList";
import {
  type SDKAggregationItem,
  useSummarizeData,
} from "../use-summarize-data";

export const SummarizeDropdown = (
  popoverProps: Omit<PopoverProps, "children" | "onClose" | "opened">,
) => {
  const aggregationItems = useSummarizeData();

  const label = match(aggregationItems.length)
    .with(0, () => t`Summarize`)
    .with(1, () => t`1 summary`)
    .otherwise(value => jt`${value} summaries`);

  const [selectedAggregationItem, setSelectedAggregationItem] =
    useState<SDKAggregationItem>();

  const [step, setStep] = useState<MultiStepState<"picker" | "list">>(null);

  const onSelectBadge = (item?: SDKAggregationItem) => {
    setSelectedAggregationItem(item);
    setStep("picker");
  };

  const onRemoveBadge = (item: SDKAggregationItem) => {
    item.onRemoveAggregation();

    if (aggregationItems.length === 1) {
      setStep(null);
    }
  };

  return (
    <MultiStepPopover
      currentStep={step}
      onClose={() => setStep(null)}
      {...popoverProps}
    >
      <MultiStepPopover.Target>
        <ToolbarButton
          label={label}
          icon="sum"
          isHighlighted={aggregationItems.length > 0}
          onClick={() =>
            setStep(
              step === null
                ? aggregationItems.length === 0
                  ? "picker"
                  : "list"
                : null,
            )
          }
        />
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="picker">
        <SummarizePicker
          aggregation={selectedAggregationItem}
          /* Called when a new aggregation is selected */
          onClose={() => setStep("list")}
          /* Called when the back button is clicked */
          onBack={() => setStep(aggregationItems.length > 0 ? "list" : null)}
        />
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="list">
        <SummarizeBadgeList
          onSelectItem={onSelectBadge}
          onAddItem={onSelectBadge}
          onRemoveItem={onRemoveBadge}
        />
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};
