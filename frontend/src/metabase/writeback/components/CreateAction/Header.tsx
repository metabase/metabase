import Icon from "metabase/components/Icon";
import EditableText from "metabase/core/components/EditableText";
import React from "react";
import Selector from "./Selector";

export type ActionType = "http";

type Props = {
  actionName: string;
  setActionName: (actionType: string) => void;

  actionType: ActionType;
  setActionType: (actionType: ActionType) => void;
};

const Header: React.FC<Props> = ({
  actionName,
  setActionName,
  actionType,
  setActionType,
}) => {
  return (
    <div className="flex justify-between w-full py-3 pl-8 pr-4 bg-white">
      <EditableText
        className="text-sm font-bold"
        initialValue={actionName}
        onChange={setActionName}
      />
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
