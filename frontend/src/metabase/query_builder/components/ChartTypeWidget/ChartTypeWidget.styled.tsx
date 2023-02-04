import styled from "@emotion/styled";
import { css } from "@emotion/react";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ChartTypeWidgetRoot = styled.div`
  border-radius: 50px;
  border: 1px solid ${color("border")};
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  margin: 1rem;
`;

interface ChartTypeWidgetIconProps {
  isSelected: boolean;
}

export const ChartTypeWidgetIcon = styled(Button)<ChartTypeWidgetIconProps>`
  color: ${color("text-medium")};

  border-radius: 20px;

  ${({ isSelected }) =>
    isSelected &&
    css`
      color: ${color("brand")};
    `}

  &:hover {
    color: ${color("brand")};
  }
`;
