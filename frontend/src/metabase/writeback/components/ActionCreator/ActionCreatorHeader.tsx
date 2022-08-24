import React from "react";
import { t } from "ttag";

import type { ActionType } from "metabase/writeback/types";

import {
  Container,
  LeftHeader,
  EditableText,
  SaveButton,
  CompactSelect,
} from "./ActionCreatorHeader.styled";

type Props = {
  name: string;
  onChangeName: (name: string) => void;

  type: ActionType;
  onChangeType?: (type: ActionType) => void;

  onCommit: () => void;
  canSave: boolean;
};

export const ActionCreatorHeader = ({
  name = t`New Action`,
  onChangeName,
  type,
  onChangeType,
  canSave,
  onCommit,
}: Props) => {
  const OPTS = [
    { value: "query", name: t`Query`, disabled: true },
    // Not supported yet
    { value: "http", name: "HTTP", disabled: true },
  ];

  return (
    <Container>
      <LeftHeader>
        <EditableText initialValue={name} onChange={onChangeName} />
        {!!onChangeType && (
          <CompactSelect options={OPTS} value={type} onChange={onChangeType} />
        )}
      </LeftHeader>
      <SaveButton
        borderless
        disabled={!canSave}
        onClick={canSave ? onCommit : undefined}
      >
        {t`Save`}
      </SaveButton>
    </Container>
  );
};
