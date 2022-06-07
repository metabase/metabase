import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Ellipsified from "metabase/core/components/Ellipsified";

export const ListRoot = styled.div`
  margin-top: 1rem;
  margin-bottom: 1rem;
`;

export const ListRow = styled.div`
  display: flex;
  padding: 0.375rem 0;
`;

export const ListRowLabel = styled(Ellipsified)`
  flex: 1 1 0;
  margin: 0.625rem 1rem 0.625rem 0;
  color: ${color("black")};
  line-height: 1rem;
  font-weight: bold;
`;

export const ListRowContent = styled.div`
  flex: 1 1 0;
`;
