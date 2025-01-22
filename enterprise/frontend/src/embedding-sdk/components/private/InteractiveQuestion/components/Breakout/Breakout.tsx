import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { QuestionStateParams } from "embedding-sdk/types/question";
import { Group, Popover } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";
import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";
import { BadgeListItem } from "../util/BadgeList/BadgeListItem";

import { BreakoutPicker } from "./BreakoutPicker/BreakoutPicker";
import { useBreakoutData } from "./use-breakout-data";

const AddBreakoutPopover = () => {
  const [opened, { close, toggle }] = useDisclosure();
  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        <AddBadgeListItem name={t`Add another grouping`} onClick={toggle} />
      </Popover.Target>
      <Popover.Dropdown>
        <BreakoutPicker onClose={close} />
      </Popover.Dropdown>
    </Popover>
  );
};

export const BreakoutInner = ({
  question,
  updateQuestion,
}: QuestionStateParams) => {
  const breakoutItems = useBreakoutData({ question, updateQuestion });

  return (
    <Group>
      {breakoutItems.map(item => (
        <Popover key={item.longDisplayName}>
          <Popover.Target>
            <BadgeListItem
              name={item.longDisplayName}
              onRemoveItem={item.removeBreakout}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <BreakoutPicker breakoutItem={item} />
          </Popover.Dropdown>
        </Popover>
      ))}
      <AddBreakoutPopover />
    </Group>
  );
};

export const Breakout = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return <BreakoutInner question={question} updateQuestion={updateQuestion} />;
};
