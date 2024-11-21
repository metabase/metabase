import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { match } from "ts-pattern";

import { MultiStepPopover } from "embedding-sdk/components/private/util/MultiStepPopover";
import type { QuestionStateParams } from "embedding-sdk/types/question";
import { Button, Stack } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../../context";
import { ToolbarButton } from "../../util/ToolbarButton";
import { BreakoutBadgeList } from "../BreakoutBadgeList";
import { BreakoutPicker } from "../BreakoutPicker";
import { type SDKBreakoutItem, useBreakoutData } from "../use-breakout-data";

export const BreakoutDropdownInner = ({
  question,
  updateQuestion,
}: QuestionStateParams) => {
  const items = useBreakoutData({ question, updateQuestion });

  const [step, setStep] = useState<"picker" | "list">("list");

  const [selectedBreakout, setSelectedBreakout] = useState<SDKBreakoutItem>();

  const [opened, { close, toggle }] = useDisclosure(false, {
    onOpen: () => setStep(items.length === 0 ? "picker" : "list"),
  });

  const label = match(items.length)
    .with(0, () => "Group")
    .with(1, () => "1 grouping")
    .otherwise(value => `${value} groupings`);

  const onSelectItem = (item?: SDKBreakoutItem) => {
    setSelectedBreakout(item);
    setStep("picker");
  };

  function handleRemoveItem(item: SDKBreakoutItem) {
    if (item) {
      item.removeBreakout();
    }
    if (items.length === 1) {
      close();
    }
  }

  return (
    <MultiStepPopover currentStep={step} opened={opened} onClose={close}>
      <MultiStepPopover.Target>
        <ToolbarButton
          label={label}
          icon="arrow_split"
          isHighlighted={items.length > 0}
          onClick={toggle}
        />
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="picker">
        <Stack>
          <Button onClick={() => setStep("list")}>Back</Button>
          <BreakoutPicker
            breakoutItem={selectedBreakout}
            onClose={() => setStep("list")}
          />
        </Stack>
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

export const BreakoutDropdown = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <BreakoutDropdownInner
      question={question}
      updateQuestion={updateQuestion}
    />
  );
};
