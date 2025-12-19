// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon, Text, type TextProps } from "metabase/ui";

export const ItemTitle = styled(Text)<TextProps>`
  margin: 0;
  word-break: break-word;
` as unknown as typeof Text;

export const ItemIcon = styled(Icon)`
  justify-self: end;
`;

const activeItemCss = css`
  background-color: var(--mb-color-brand);

  ${ItemIcon},
  ${ItemTitle} {
    color: var(--mb-color-text-primary-inverse);
  }
`;

const VERTICAL_PADDING_BY_SIZE = {
  small: "0.5rem",
  medium: "0.75rem",
};

export const BaseItemRoot = styled.li<{
  size: "small" | "medium";
  isSelected: boolean;
}>`
  display: grid;
  align-items: center;
  cursor: pointer;
  padding: ${(props) => VERTICAL_PADDING_BY_SIZE[props.size]} 0.5rem;
  border-radius: 6px;
  margin-bottom: 2px;

  &:last-child {
    margin-bottom: 0;
  }

  ${(props) => props.isSelected && activeItemCss}

  &:hover {
    ${activeItemCss}
  }
`;

const getGridTemplateColumns = (hasLeftIcon: boolean, hasRightIcon: boolean) =>
  `${hasLeftIcon ? "min-content" : ""} 1fr ${
    hasRightIcon ? "min-content" : ""
  }`;

export const ItemRoot = styled(BaseItemRoot)<{
  hasLeftIcon: boolean;
  hasRightIcon: boolean;
}>`
  display: grid;
  grid-template-columns: ${(props) =>
    getGridTemplateColumns(props.hasLeftIcon, props.hasRightIcon)};
  gap: 0.5rem;
`;
