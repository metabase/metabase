import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const TargetTrigger = styled.div`
  display: flex;
  padding: 0.5rem;
  border-radius: 0.5rem;
  width: 100%;
  margin-bottom: 0.5rem;
  font-weight: bold;

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-light")};
  }
`;
