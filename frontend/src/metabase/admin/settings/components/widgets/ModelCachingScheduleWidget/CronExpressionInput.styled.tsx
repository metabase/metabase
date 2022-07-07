import styled from "@emotion/styled";

import { color, darken } from "metabase/lib/colors";

import { commonLabelStyle } from "./ModelCachingScheduleWidget.styled";

export const CustomScheduleLabel = styled.span`
  ${commonLabelStyle}
  color: ${color("text-medium")};
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5rem;

  margin-bottom: 6px;
`;

export const ErrorMessage = styled.span`
  color: ${color("error")};
  margin-top: 4px;
`;

export const StyledInput = styled.input`
  border: 1px solid ${darken("border", 0.1)};
`;
