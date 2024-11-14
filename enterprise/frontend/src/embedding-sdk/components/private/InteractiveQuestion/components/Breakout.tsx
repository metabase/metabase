import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { match } from "ts-pattern";

import { BadgeList } from "embedding-sdk/components/private/InteractiveQuestion/components/BadgeList";
import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { MultiStepPopover } from "embedding-sdk/components/private/util/MultiStepPopover";
import { getBreakoutListItem } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import { useBreakoutQueryHandlers } from "metabase/query_builder/hooks/use-breakout-query-handlers";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { Box, Button, type ButtonProps, Icon, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

const BreakoutButton = ({
  query,
  stageIndex,
  ...buttonProps
}: UpdateQueryHookProps & ButtonProps) => {
  const breakouts = Lib.breakouts(query, stageIndex);

  const items = breakouts.map(breakout =>
    getBreakoutListItem(query, stageIndex, breakout),
  );

  const label = match(items.length)
    .with(0, () => "Group")
    .with(1, () => "1 grouping")
    .otherwise(value => `${value} groupings`);

  const variant = items.length ? "filled" : "default";

  return (
    <Button
      variant={variant}
      leftIcon={<Icon name="arrow_split" />}
      {...buttonProps}
    >
      {label}
    </Button>
  );
};

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
        <Box>
          <BreakoutButton
            query={query}
            onQueryChange={onQueryChange}
            stageIndex={stageIndex}
            onClick={toggle}
          />
        </Box>
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
