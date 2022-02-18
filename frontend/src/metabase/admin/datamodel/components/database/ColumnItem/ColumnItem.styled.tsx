import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ColumnItemRoot = styled.div`
  display: flex;
  padding: 0.5rem;
  margin-top: 0.5rem;
  margin-bottom: 3rem;
  border: 1px solid ${color("border")};
  border-radius: 8px;
`;

export const ColumnItemContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: auto;
`;

export const ColumnItemFieldRow = styled.div`
  display: flex;
  flex-direction: column;
  flex: auto;
`;

export const ColumnItemFieldGroup = styled.div`
  display: flex;
  flex: auto;
`;
