/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import { ActionType } from "metabase/writeback/types";
import Selector from "./Selector";

type Props = {
  name: string;
  onNameChange: (name: string) => void;

  type: ActionType;
  setType?: (type: ActionType) => void;

  onCommit: () => void;
  canSave: boolean;
};

const Header: React.FC<Props> = ({
  name,
  onNameChange,
  type,
  setType,
  canSave,
  onCommit,
}) => {
  const OPTS = [
    { value: "http", label: "HTTP" },
    // Not supported yet
    // { value: "query", label: t`Query` },
  ];

  return (
    <div className="flex align-center justify-between w-full py-3 pl-8 pr-4 bg-white">
      <div className="flex align-center space-x-4">
        <EditableText
          className="text-sm font-bold"
          initialValue={name}
          onChange={onNameChange}
        />
        {setType ? (
          <Selector
            className="text-light"
            options={OPTS}
            value={type}
            setValue={value => setType(value as ActionType)}
          />
        ) : (
          <h2 className="text-light">
            {OPTS.find(({ value }) => value === type)?.label}
          </h2>
        )}
      </div>
      <button
        className={cx(
          "font-semibold",
          canSave ? "text-brand hover:text-opacity-50" : "text-medium",
        )}
        disabled={!canSave}
        onClick={canSave ? onCommit : undefined}
      >
        {t`Save`}
      </button>
    </div>
  );
};

export default Header;
