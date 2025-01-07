import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const SchemaHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

export const FieldList = styled.ul`
  padding-top: 1rem;
`;

export const FieldTitle = styled.span`
  font-weight: bold;
`;

export const FieldIcon = styled(Icon)``;

export const FieldListItem = styled.li`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  border-radius: 8px;

  ${FieldTitle} {
    margin-left: 1rem;
  }
`;
