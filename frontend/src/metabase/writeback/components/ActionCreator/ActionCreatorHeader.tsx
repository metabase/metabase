import React from "react";
import { t } from "ttag";

import type { WritebackActionType } from "metabase-types/api";

import {
  Container,
  LeftHeader,
  EditableText,
  CompactSelect,
} from "./ActionCreatorHeader.styled";

type Props = {
  name: string;
  onChangeName: (name: string) => void;

  type: WritebackActionType;
  onChangeType?: (type: WritebackActionType) => void;
};

export const ActionCreatorHeader = ({
  name = t`New Action`,
  onChangeName,
  type,
  onChangeType,
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
    </Container>
  );
};
