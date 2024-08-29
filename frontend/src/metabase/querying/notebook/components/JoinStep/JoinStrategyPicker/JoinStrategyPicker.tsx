import { useMemo, useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import SelectList from "metabase/components/SelectList";
import type { IconName } from "metabase/ui";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  JoinStrategyIcon,
  JoinStrategyList,
} from "./JoinStrategyPicker.styled";

interface JoinStrategyPickerProps {
  query: Lib.Query;
  stageIndex: number;
  strategy: Lib.JoinStrategy;
  isReadOnly: boolean;
  onChange: (newStrategy: Lib.JoinStrategy) => void;
}

export function JoinStrategyPicker({
  query,
  stageIndex,
  strategy,
  isReadOnly,
  onChange,
}: JoinStrategyPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  const strategyInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, strategy),
    [query, stageIndex, strategy],
  );

  const handleChange = (newStrategy: Lib.JoinStrategy) => {
    onChange(newStrategy);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <IconButtonWrapper
          disabled={isReadOnly}
          aria-label={t`Change join type`}
          onClick={() => setIsOpened(!isOpened)}
        >
          <JoinStrategyIcon
            name={JOIN_ICON[strategyInfo.shortName]}
            tooltip={t`Change join type`}
            size={32}
          />
        </IconButtonWrapper>
      </Popover.Target>
      <Popover.Dropdown>
        <JoinStrategyDropdown
          query={query}
          stageIndex={stageIndex}
          strategyInfo={strategyInfo}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface JoinStrategyDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  strategyInfo: Lib.JoinStrategyDisplayInfo;
  onChange: (strategy: Lib.JoinStrategy) => void;
}

function JoinStrategyDropdown({
  query,
  stageIndex,
  strategyInfo,
  onChange,
}: JoinStrategyDropdownProps) {
  const items = useMemo(
    () =>
      Lib.availableJoinStrategies(query, stageIndex).map(strategy => ({
        strategy,
        strategyInfo: Lib.displayInfo(query, stageIndex, strategy),
      })),
    [query, stageIndex],
  );

  return (
    <JoinStrategyList>
      {items.map((item, index) => (
        <SelectList.Item
          id={index}
          key={index}
          name={JOIN_NAME[item.strategyInfo.shortName]}
          icon={{ name: JOIN_ICON[item.strategyInfo.shortName], size: 24 }}
          isSelected={strategyInfo.shortName === item.strategyInfo.shortName}
          onSelect={() => onChange(item.strategy)}
        />
      ))}
    </JoinStrategyList>
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
