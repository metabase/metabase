import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import EditableText from "metabase/core/components/EditableText";
import { ActionType } from "metabase/writeback/types";
import Selector from "./Selector";

type Props = {
  name: string;
  setName: (name: string) => void;

  type: ActionType;
  setType: (type: ActionType) => void;

  save: () => void;
  canSave: boolean;
};

const Header: React.FC<Props> = ({
  name,
  setName,
  type,
  setType,
  canSave,
  save,
}) => {
  return (
    <div className="flex items-center justify-between w-full py-3 pl-8 pr-4 bg-white">
      <div className="flex items-center space-x-4">
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
      <button
        className={cx(
          "font-semibold",
          canSave ? "text-brand hover:text-opacity-50" : "text-text-medium",
        )}
        disabled={!canSave}
        onClick={canSave ? save : undefined}
      >
        Save
      </button>
    </div>
  );
};

const OPTS = [
  { value: "http", label: "HTTP" },
  { value: "question", label: "Question" },
];

export default Header;
