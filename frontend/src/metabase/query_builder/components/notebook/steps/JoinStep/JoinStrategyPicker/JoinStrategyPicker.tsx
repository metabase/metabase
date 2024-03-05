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
  readOnly?: boolean;
  onChange: (strategy: Lib.JoinStrategy) => void;
}

export function JoinStrategyPicker({
  query,
  stageIndex,
  strategy,
  readOnly = false,
  onChange,
}: JoinStrategyPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  const items = useMemo(
    () =>
      Lib.availableJoinStrategies(query, stageIndex).map(strategy => ({
        strategy,
        strategyInfo: Lib.displayInfo(query, stageIndex, strategy),
      })),
    [query, stageIndex],
  );

  const strategyInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, strategy),
    [query, stageIndex, strategy],
  );

  const strategyIcon = JOIN_ICON[strategyInfo.shortName];

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <IconButtonWrapper
          disabled={readOnly}
          aria-label={t`Change join type`}
          onClick={() => setIsOpened(!isOpened)}
        >
          <JoinStrategyIcon
            name={strategyIcon}
            tooltip={t`Change join type`}
            size={32}
          />
        </IconButtonWrapper>
      </Popover.Target>
      <Popover.Dropdown>
        <JoinStrategyList>
          {items.map((item, index) => (
            <SelectList.Item
              id={index}
              key={index}
              name={JOIN_NAME[item.strategyInfo.shortName]}
              icon={{ name: JOIN_ICON[item.strategyInfo.shortName], size: 24 }}
              isSelected={
                strategyInfo.shortName === item.strategyInfo.shortName
              }
              onSelect={() => {
                onChange(item.strategy);
                setIsOpened(false);
              }}
            />
          ))}
        </JoinStrategyList>
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
