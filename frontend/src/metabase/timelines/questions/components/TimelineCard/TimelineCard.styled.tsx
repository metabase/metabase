import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import CheckBox from "metabase/core/components/CheckBox";

export const CardHeader = styled.div`
  display: flex;
`;

export const CardTitle = styled.span`
  margin-left: 0.5rem;
  color: ${color("text-dark")};
  font-weight: bold;
  font-size: 0.875rem;
`;

export const CardToggle = styled(CheckBox)`
  height: 1rem;
`;

export const CardList = styled.div`
  padding: 1rem 0;
`;
