import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
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
  font-weight: 700;
`;

export const FieldIcon = styled(Icon)``;

export const FieldListItem = styled.li`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  padding: 1rem 0.5rem;

  ${FieldTitle} {
    margin-left: 1rem;
  }

  &:hover {
    background-color: ${color("brand-light")};
  }
`;
