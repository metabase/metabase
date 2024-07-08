import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ToggleContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

export const Label = styled.label`
  width: 100%;
  cursor: pointer;
  color: ${color("text-medium")};
  font-weight: 700;
`;

export const Description = styled.p`
  margin-top: 24px;
  color: ${color("text-medium")};
  line-height: 22px;
`;

export const Error = styled(Description)`
  color: ${color("error")};
  border-left: 3px solid ${color("error")};
  padding-left: 12px;
`;
