import { useDisclosure } from "@mantine/hooks";
import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { Group, Popover } from "metabase/ui";

import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";
import { BadgeListItem } from "../util/BadgeList/BadgeListItem";

import { SummarizePicker } from "./SummarizePicker";
import {
  type SDKAggregationItem,
  useSummarizeData,
} from "./use-summarize-data";

const SummarizePopover = ({
  item,
}: PropsWithChildren<{
  item?: SDKAggregationItem;
}>) => {
  const [opened, { close, toggle }] = useDisclosure();

  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        {item ? (
          <BadgeListItem
            onRemoveItem={() => item.onRemoveAggregation()}
            name={item.displayName}
            onClick={toggle}
          />
        ) : (
          <AddBadgeListItem name={t`Add another summary`} onClick={toggle} />
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <SummarizePicker aggregation={item} onClose={close} />
      </Popover.Dropdown>
    </Popover>
  );
};

export const Summarize = () => {
  const items = useSummarizeData();

  return (
    <Group>
      {items.map((item, index) => (
        <SummarizePopover item={item} key={`${item.displayName}/${index}`} />
      ))}
      <SummarizePopover />
    </Group>
  );
};
