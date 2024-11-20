import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { SummarizePicker } from "embedding-sdk/components/private/InteractiveQuestion/components/Summarize/SummarizePicker";
import { MultiStepPopover } from "embedding-sdk/components/private/util/MultiStepPopover";

import { ToolbarButton } from "../util/ToolbarButton";

import { SummarizeBadgeList } from "./SummarizeBadgeList";
import {
  type SDKAggregationItem,
  useSummarizeData,
} from "./use-summarize-data";

export const SummarizeDropdown = () => {
  const aggregationItems = useSummarizeData();

  const label = match(aggregationItems.length)
    .with(0, () => t`Summarize`)
    .with(1, () => t`1 summary`)
    .otherwise(value => jt`${value} summaries`);

  const [selectedAggregationItem, setSelectedAggregationItem] =
    useState<SDKAggregationItem>();

  const [step, setStep] = useState<"picker" | "list">("picker");
  const [opened, { close, toggle }] = useDisclosure(false, {
    onOpen: () => setStep(aggregationItems.length === 0 ? "picker" : "list"),
  });

  const onSelectBadge = (item?: SDKAggregationItem) => {
    setSelectedAggregationItem(item);
    setStep("picker");
  };

  const onRemoveBadge = (item: SDKAggregationItem) => {
    item.onRemoveAggregation();

    if (aggregationItems.length === 1) {
      close();
    }
  };

  return (
    <MultiStepPopover currentStep={step} opened={opened} onClose={close}>
      <MultiStepPopover.Target>
        <ToolbarButton
          label={label}
          icon="sum"
          isHighlighted={aggregationItems.length > 0}
          onClick={toggle}
        />
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="picker">
        <SummarizePicker
          aggregation={selectedAggregationItem}
          /* Called when a new aggregation is selected */
          onClose={() => setStep("list")}
          /* Called when the back button is clicked */
          onBack={() => setStep("list")}
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
