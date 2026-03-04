import { useMemo, useState } from "react";
import { t } from "ttag";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { SelectList } from "metabase/common/components/SelectList";
import { Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getJoinStrategyIcon } from "../utils";

import S from "./JoinStrategyPicker.module.css";

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
    <Popover
      opened={isOpened}
      position="bottom-start"
      onChange={setIsOpened}
      disabled={isReadOnly}
    >
      <Popover.Target>
        <Tooltip disabled={isReadOnly} label={t`Change join type`}>
          <IconButtonWrapper
            disabled={isReadOnly}
            aria-label={t`Change join type`}
            onClick={() => setIsOpened(!isOpened)}
          >
            <Icon
              className={S.JoinStrategyIcon}
              name={getJoinStrategyIcon(strategyInfo)}
              size={32}
            />
          </IconButtonWrapper>
        </Tooltip>
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
      Lib.availableJoinStrategies(query, stageIndex).map((strategy) => ({
        strategy,
        strategyInfo: Lib.displayInfo(query, stageIndex, strategy),
      })),
    [query, stageIndex],
  );

  return (
    <SelectList className={S.JoinStrategyList}>
      {items.map((item, index) => (
        <SelectList.Item
          id={index}
          key={index}
          name={item.strategyInfo.displayName}
          icon={{ name: getJoinStrategyIcon(item.strategyInfo), size: 24 }}
          isSelected={strategyInfo.shortName === item.strategyInfo.shortName}
          onSelect={() => onChange(item.strategy)}
        />
      ))}
    </SelectList>
  );
}
