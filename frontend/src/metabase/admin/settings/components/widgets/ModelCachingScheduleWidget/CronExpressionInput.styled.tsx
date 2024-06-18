import styled from "@emotion/styled";

import { darken } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { commonLabelStyle } from "./ModelCachingScheduleWidget.styled";

export const CustomScheduleLabel = styled.span`
  ${commonLabelStyle}
  color: var(--mb-color-text-medium);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5rem;

  margin-bottom: 6px;
`;

export const ErrorMessage = styled.span`
  color: var(--mb-color-error);
  margin-top: 4px;
`;

export const StyledInput = styled.input`
  width: 100%;
  border: 1px solid ${({ theme }) => darken(theme.fn.themeColor("border"), 0.1)};
`;

export const InputContainer = styled.div`
  position: relative;
`;

export const InfoIcon = styled(Icon)`
  position: absolute;
  right: 1rem;
  top: 33%;

  color: var(--mb-color-text-medium);

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const PopoverContent = styled.div`
  background-color: #222;
  padding: 18px;

  color: var(--mb-color-text-white);
`;

export const PopoverTitle = styled.span`
  display: block;
  font-weight: 700;
`;

export const PopoverText = styled.span`
  display: block;
  margin-top: 4px;
`;
