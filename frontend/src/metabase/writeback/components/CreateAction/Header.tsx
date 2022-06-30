import Icon from "metabase/components/Icon";
import EditableText from "metabase/core/components/EditableText";
import { ActionType, SaveAction } from "metabase/writeback/types";
import React from "react";
import Selector from "./Selector";

type Props = {
  name: string;
  setName: (name: string) => void;

  type: ActionType;
  setType: (type: ActionType) => void;

  save: SaveAction;
};

const Header: React.FC<Props> = ({ name, setName, type, setType }) => {
  return (
    <div className="flex items-center justify-between w-full py-3 pl-8 pr-4 bg-white">
      <div>
        <EditableText
          className="text-sm font-bold"
          initialValue={name}
          onChange={setName}
        />
        <Selector
          options={OPTS}
          value={type}
          setValue={value => setType(value as ActionType)}
        />
      </div>
      <button className="">Save</button>
    </div>
  );
};

const OPTS = [
  { value: "http", label: "HTTP" },
  { value: "question", label: "Question" },
];

export default Header;
