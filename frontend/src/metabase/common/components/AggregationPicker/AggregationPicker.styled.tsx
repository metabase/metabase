import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";

export const Root = styled.div<{ color: ColorName }>`
  color: ${props => color(props.color)};
`;

export const ColumnPickerContainer = styled.div`
  min-width: 300px;
`;

export const ColumnPickerHeaderContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 0.5rem;
  border-bottom: 1px solid ${color("border")};
  color: ${color("text-medium")};
`;

export const ColumnPickerHeaderTitleContainer = styled.a`
  display: flex;
  align-items: center;
  cursor: pointer;
  gap: 0.5rem;
`;

export const ColumnPickerHeaderTitle = styled.span`
  display: inline-block;
  font-weight: 700;
  font-size: 1.17em;
`;
