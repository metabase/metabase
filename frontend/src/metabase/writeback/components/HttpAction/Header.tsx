/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { t } from "ttag";

import { ActionType } from "metabase/writeback/types";
import Selector from "./Selector";

import {
  Container,
  LeftHeader,
  EditableText,
  Option,
  RightHeader,
} from "./Header.styled";

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
    <Container className="flex justify-between w-full py-3 pl-8 pr-4 bg-white align-center">
      <LeftHeader className="flex space-x-4 align-center">
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
          <Option className="text-light">
            {OPTS.find(({ value }) => value === type)?.label}
          </Option>
        )}
      </LeftHeader>
      <RightHeader
        className={cx(
          "font-semibold",
          canSave ? "text-brand hover:text-opacity-50" : "text-medium",
        )}
        disabled={!canSave}
        onClick={canSave ? onCommit : undefined}
      >
        {t`Save`}
      </RightHeader>
    </Container>
  );
};

export default Header;
