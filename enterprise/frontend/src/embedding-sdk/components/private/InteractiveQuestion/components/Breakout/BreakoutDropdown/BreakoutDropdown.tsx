import { useState } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import {
  MultiStepPopover,
  type MultiStepState,
} from "embedding-sdk/components/private/util/MultiStepPopover";
import type { QuestionStateParams } from "embedding-sdk/types/question";
import type { PopoverProps } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../../context";
import { ToolbarButton } from "../../util/ToolbarButton";
import { BreakoutBadgeList } from "../BreakoutBadgeList";
import { BreakoutPicker } from "../BreakoutPicker";
import { type SDKBreakoutItem, useBreakoutData } from "../use-breakout-data";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionBreakoutDropdownProps = Omit<
  PopoverProps,
  "children" | "onClose" | "opened"
>;

export const BreakoutDropdownInner = ({
  question,
  updateQuestion,
  ...popoverProps
}: QuestionStateParams & InteractiveQuestionBreakoutDropdownProps) => {
  const items = useBreakoutData({ question, updateQuestion });

  const [step, setStep] = useState<MultiStepState<"picker" | "list">>(null);

  const [selectedBreakout, setSelectedBreakout] = useState<SDKBreakoutItem>();

  const label = match(items.length)
    .with(0, () => t`Group`)
    .with(1, () => t`1 grouping`)
    .otherwise(
      (value) =>
        c(
          "{0} refers to a number greater than 1 (i.e. 2 groupings, 10 groupings)",
        ).t`${value} groupings`,
    );

  const onSelectItem = (item?: SDKBreakoutItem) => {
    setSelectedBreakout(item);
    setStep("picker");
  };

  function handleRemoveItem(item: SDKBreakoutItem) {
    if (item) {
      item.removeBreakout();
    }
    if (items.length === 1) {
      setStep(null);
    }
  }

  return (
    <MultiStepPopover
      currentStep={step}
      onClose={() => setStep(null)}
      {...popoverProps}
    >
      <MultiStepPopover.Target>
        <ToolbarButton
          label={label}
          icon="arrow_split"
          isHighlighted={items.length > 0}
          onClick={
            step === null
              ? () => setStep(items.length === 0 ? "picker" : "list")
              : () => setStep(null)
          }
        />
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="picker">
        <BreakoutPicker
          breakoutItem={selectedBreakout}
          onClose={() => setStep("list")}
        />
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="list">
        <BreakoutBadgeList
          onSelectItem={onSelectItem}
          onAddItem={onSelectItem}
          onRemoveItem={handleRemoveItem}
        />
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};

/**
 * Dropdown button for the Breakout component.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const BreakoutDropdown = (
  props: InteractiveQuestionBreakoutDropdownProps,
) => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <BreakoutDropdownInner
      question={question}
      updateQuestion={updateQuestion}
      {...props}
    />
  );
};
