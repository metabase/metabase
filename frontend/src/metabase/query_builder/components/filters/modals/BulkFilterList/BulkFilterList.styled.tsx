import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ListRoot = styled.div`
  margin-top: 1rem;
  margin-bottom: 1rem;
`;

export const ListRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0;
`;

export const ListLabel = styled.div`
  flex: 1 1 0;
  color: ${color("black")};
  font-weight: bold;
`;

export const ListAction = styled.div`
  flex: 1 1 0;
`;
