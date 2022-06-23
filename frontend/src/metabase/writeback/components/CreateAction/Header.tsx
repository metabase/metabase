import Icon from "metabase/components/Icon";
import React from "react";
import Selector from "./Selector";

export type ActionType = "http";

type Props = {
  actionType: ActionType;
  setActionType: (actionType: ActionType) => void;
};

const Header: React.FC<Props> = ({ actionType, setActionType }) => {
  return (
    <div className="flex justify-between w-full py-3 pl-8 pr-4 bg-white">
      <h2>New Action</h2>
      <Selector
        options={OPTS}
        value={actionType}
        setValue={value => setActionType(value as ActionType)}
      />
    </div>
  );
};

const OPTS = [
  { value: "http", label: "HTTP" },
  { value: "question", label: "Question" },
];

export default Header;
