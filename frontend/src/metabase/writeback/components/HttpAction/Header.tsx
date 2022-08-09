/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import { ActionType } from "metabase/writeback/types";

import CompactSelect from "./CompactSelect";

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
    { value: "http", name: "HTTP" },
    // Not supported yet
    { value: "query", name: t`Query`, disabled: true },
  ];

  return (
    <Container>
      <LeftHeader>
        <EditableText initialValue={name} onChange={onNameChange} />
        {setType ? (
          <CompactSelect
            className="text-light"
            options={OPTS}
            value={type}
            onChange={(value: ActionType) => setType(value)}
          />
        ) : (
          <Option className="text-light">
            {OPTS.find(({ value }) => value === type)?.name}
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
