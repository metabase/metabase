import React from "react";

import NotebookCell, { NotebookCellItem } from "../NotebookCell";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { Flex } from "grid-styled";

import cx from "classnames";

export default function JoinStep({ color, query, isLastOpened, ...props }) {
  return (
    <NotebookCell color={color}>
      <NotebookCellItem color={color}>
        <Icon className="mr1" name="table2" size={12} />
        Orders
      </NotebookCellItem>

      <PopoverWithTrigger
        triggerElement={
          <Icon className="text-brand mr1" name="join_left_outer" size={32} />
        }
      >
        <JoinTypeSelect value="left-outer" onChange={() => alert("nyi")} />
      </PopoverWithTrigger>

      <NotebookCellItem color={color}>
        <Icon className="mr1" name="table2" size={12} />
        People
      </NotebookCellItem>

      <span className="text-medium text-bold ml1 mr2">where</span>

      <NotebookCellItem color={color}>
        <Icon className="mr1" name="label" size={12} />
        User ID
      </NotebookCellItem>

      <span className="text-medium text-bold mr1">=</span>

      <NotebookCellItem color={color}>
        <Icon className="mr1" name="label" size={12} />
        People ID
      </NotebookCellItem>
    </NotebookCell>
  );
}

const JOIN_TYPES = [
  { name: "Left outer join", icon: "join_left_outer" },
  { name: "Right outer join", icon: "join_left_outer" },
  { name: "Inner join", icon: "join_left_outer" },
  { name: "Full outer join", icon: "join_left_outer" },
];

const JoinTypeSelect = ({ value, onChange }) => (
  <div className="px1 pt1">
    {JOIN_TYPES.map(joinType => (
      <JoinTypeOption
        {...joinType}
        selected={value === joinType.value}
        onChange={onChange}
      />
    ))}
  </div>
);

const JoinTypeOption = ({ name, value, icon, selected, onChange }) => (
  <Flex
    align="center"
    className={cx(
      "p1 mb1 rounded cursor-pointer text-white-hover bg-brand-hover",
      {
        "bg-brand text-white": selected,
      },
    )}
  >
    <Icon
      className={cx("mr1", { "text-brand": !selected })}
      name="join_left_outer"
      size={24}
      onChange={() => onChange(value)}
    />
    {name}
  </Flex>
);
