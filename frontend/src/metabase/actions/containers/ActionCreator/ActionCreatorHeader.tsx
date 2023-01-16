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
  type: WritebackActionType;
  onChangeName: (name: string) => void;
  onChangeType?: (type: WritebackActionType) => void;
};

const OPTS = [{ value: "query", name: t`Query`, disabled: true }];

const ActionCreatorHeader = ({
  name = t`New Action`,
  type,
  onChangeName,
  onChangeType,
}: Props) => {
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

export default ActionCreatorHeader;
