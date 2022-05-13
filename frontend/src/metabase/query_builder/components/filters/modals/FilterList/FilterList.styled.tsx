import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ListRoot = styled.div`
  margin-top: 1rem;
  margin-bottom: 1rem;
`;

export const ListRow = styled.div`
  padding: 0.5rem 0;
`;

export const ListLabel = styled.div`
  color: ${color("black")};
  font-weight: bold;
`;
