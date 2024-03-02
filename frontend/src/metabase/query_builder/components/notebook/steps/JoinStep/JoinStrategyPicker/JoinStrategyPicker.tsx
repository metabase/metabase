import { useMemo, useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import SelectList from "metabase/components/SelectList";
import type { IconName } from "metabase/ui";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinStrategyIcon } from "./JoinStrategyPicker.styled";

interface JoinStrategyPickerProps {
  query: Lib.Query;
  stageIndex: number;
  strategy: Lib.JoinStrategy;
  readOnly?: boolean;
  onChange: (strategy: Lib.JoinStrategy) => void;
}

export function JoinStrategyPicker({
  query,
  stageIndex,
  strategy: currentStrategy,
  readOnly = false,
  onChange,
}: JoinStrategyPickerProps) {
  const items = useMemo(
    () =>
      Lib.availableJoinStrategies(query, stageIndex).map(strategy => ({
        ...Lib.displayInfo(query, stageIndex, strategy),
        strategy,
      })),
    [query, stageIndex],
  );

  const [isOpened, setIsOpened] = useState(false);

  const currentStrategyInfo = Lib.displayInfo(
    query,
    stageIndex,
    currentStrategy,
  );
  const currentStrategyIcon = JOIN_ICON[currentStrategyInfo.shortName];

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <IconButtonWrapper
          onClick={() => setIsOpened(!isOpened)}
          disabled={readOnly}
          aria-label={t`Change join type`}
        >
          <JoinStrategyIcon
            name={currentStrategyIcon}
            tooltip={t`Change join type`}
            size={32}
          />
        </IconButtonWrapper>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList className="p1">
          {items.map(item => (
            <SelectList.Item
              key={item.shortName}
              id={item.shortName}
              name={JOIN_NAME[item.shortName]}
              icon={{ name: JOIN_ICON[item.shortName], size: 24 }}
              isSelected={currentStrategyInfo.shortName === item.shortName}
              onSelect={() => {
                onChange(item.strategy);
                setIsOpened(false);
              }}
            />
          ))}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  );
}

const JOIN_NAME: Record<string, string> = {
  "left-join": t`Left outer join`,
  "right-join": t`Right outer join`,
  "inner-join": t`Inner join`,
  "full-join": t`Full outer join`,
};

const JOIN_ICON: Record<string, IconName> = {
  "left-join": "join_left_outer",
  "right-join": "join_right_outer",
  "inner-join": "join_inner",
  "full-join": "join_full_outer",
};
