import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { match } from "ts-pattern";

import S from "embedding-sdk/components/private/InteractiveQuestion/components/Picker.module.css";
import {
  type ListItem as BreakoutListItem,
  getBreakoutListItem,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import {
  type UpdateQueryHookProps,
  useBreakoutQueryHandlers,
} from "metabase/query_builder/hooks";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { Button, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { MultiStepPopover } from "../../../util/MultiStepPopover";
import { useInteractiveQuestionContext } from "../../context";
import { BadgeList } from "../util/BadgeList";
import { ToolbarButton } from "../util/ToolbarButton";
type BreakoutItem = {
  breakout?: Lib.BreakoutClause;
  breakoutIndex?: number;
};

export const BreakoutInner = ({
  query,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const { onAddBreakout, onUpdateBreakout, onRemoveBreakout } =
    useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  const breakouts = Lib.breakouts(query, stageIndex);

  const items: BreakoutListItem[] = breakouts.map(breakout =>
    getBreakoutListItem(query, stageIndex, breakout),
  );

  const [step, setStep] = useState<"picker" | "list">("list");

  const [selectedBreakout, setSelectedBreakout] = useState<BreakoutItem>({
    breakout: undefined,
    breakoutIndex: undefined,
  });

  const [opened, { close, toggle }] = useDisclosure(false, {
    onOpen: () => setStep(items.length === 0 ? "picker" : "list"),
  });

  const label = match(items.length)
    .with(0, () => "Group")
    .with(1, () => "1 grouping")
    .otherwise(value => `${value} groupings`);

  const onSelectItem = (item?: BreakoutListItem, index?: number) => {
    setSelectedBreakout({
      breakout: item?.breakout,
      breakoutIndex: index,
    });
    setStep("picker");
  };

  function handleRemoveItem(item: BreakoutListItem) {
    if (item.breakout) {
      onRemoveBreakout(item.breakout);
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
          <BreakoutPopover
            className={S.PickerContainer}
            query={query}
            stageIndex={stageIndex}
            breakout={selectedBreakout.breakout}
            breakoutIndex={selectedBreakout.breakoutIndex}
            onAddBreakout={onAddBreakout}
            onUpdateBreakoutColumn={onUpdateBreakout}
            onClose={close}
            isMetric={false}
          />
        </Stack>
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="list">
        <BadgeList
          items={items.map(item => ({
            name: item.displayName,
            item,
          }))}
          onSelectItem={onSelectItem}
          onAddItem={onSelectItem}
          onRemoveItem={handleRemoveItem}
          addButtonLabel={"Add grouping"}
        />
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};

export const Breakout = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  const query = question.query();

  const onQueryChange = (newQuery: Lib.Query) => {
    updateQuestion(question.setQuery(newQuery), { run: true });
  };

  return (
    <BreakoutInner
      query={query}
      onQueryChange={onQueryChange}
      stageIndex={-1}
    />
  );
};
