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
    <Container>
      <LeftHeader>
        <EditableText initialValue={name} onChange={onNameChange} />
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
        borderless
        enabled={canSave}
        disabled={!canSave}
        onClick={canSave ? onCommit : undefined}
      >
        {t`Save`}
      </RightHeader>
    </Container>
  );
};

export default Header;
