import { useDisclosure } from "@mantine/hooks";
import { type Ref, forwardRef, useState } from "react";
import { match } from "ts-pattern";

import { getBreakoutListItem } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import {
  type UpdateQueryHookProps,
  useBreakoutQueryHandlers,
} from "metabase/query_builder/hooks";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { Button, type ButtonProps, Icon, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { MultiStepPopover } from "../../util/MultiStepPopover";
import { useInteractiveQuestionContext } from "../context";

import { BadgeList } from "./util/BadgeList";

const BreakoutButtonInner = (
  { query, stageIndex, ...buttonProps }: UpdateQueryHookProps & ButtonProps,
  ref: Ref<HTMLButtonElement>,
) => {
  const breakouts = Lib.breakouts(query, stageIndex);

  const items = breakouts.map(breakout =>
    getBreakoutListItem(query, stageIndex, breakout),
  );

  const label = match(items.length)
    .with(0, () => "Group")
    .with(1, () => "1 grouping")
    .otherwise(value => `${value} groupings`);

  const variant = items.length ? "filled" : "subtle";

  return (
    <Button
      ref={ref}
      variant={variant}
      leftIcon={<Icon name="arrow_split" />}
      py="sm"
      px="md"
      {...buttonProps}
    >
      {label}
    </Button>
  );
};

const BreakoutButton = forwardRef(BreakoutButtonInner);

export const BreakoutInner = ({
  query,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const { onAddBreakout, onUpdateBreakout, onRemoveBreakout } =
    useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  const breakouts = Lib.breakouts(query, stageIndex);

  const items = breakouts.map(breakout =>
    getBreakoutListItem(query, stageIndex, breakout),
  );

  const [step, setStep] = useState<"picker" | "list">("list");

  const [selectedBreakout, setSelectedBreakout] = useState<{
    breakout?: Lib.BreakoutClause;
    breakoutIndex?: number;
  }>({
    breakout: undefined,
    breakoutIndex: undefined,
  });

  const [opened, { close, toggle }] = useDisclosure(false, {
    onOpen: () => {
      if (items.length === 0) {
        setStep("picker");
      } else {
        setStep("list");
      }
    },
  });

  return (
    <MultiStepPopover currentStep={step} opened={opened} onClose={close}>
      <MultiStepPopover.Target>
        <BreakoutButton
          query={query}
          onQueryChange={onQueryChange}
          stageIndex={stageIndex}
          onClick={toggle}
        />
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="picker">
        <Stack>
          <Button onClick={() => setStep("list")}>Back</Button>
          <BreakoutPopover
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
          onSelectItem={(item, index) => {
            setSelectedBreakout({
              breakout: item?.breakout,
              breakoutIndex: index,
            });
            setStep("picker");
          }}
          onAddItem={() => {
            setStep("picker");
            setSelectedBreakout({});
          }}
          onRemoveItem={item => {
            if (item?.breakout) {
              onRemoveBreakout(item.breakout);
            }
            if (items.length === 1) {
              close();
            }
          }}
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
