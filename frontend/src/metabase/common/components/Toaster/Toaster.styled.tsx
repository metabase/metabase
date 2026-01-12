// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { alpha, lighten } from "metabase/lib/colors";

interface ToasterContainerProps {
  show: boolean;
  fixed?: boolean;
}

export const ToasterContainer = styled.div<ToasterContainerProps>`
  display: flex;
  flex-direction: row;
  overflow-x: hidden;
  min-width: 300px;
  max-width: 500px;
  width: fit-content;
  background-color: var(--mb-color-text-primary);
  padding: 16px;
  border-radius: 6px;
  ${(props) =>
    props.fixed
      ? `position: fixed;
       bottom: ${props.show ? "20px" : "10px"};
       left: 20px;`
      : `position: relative;
       bottom: ${props.show ? "0px" : "-10px"};`}
  opacity: ${(props) => (props.show ? 1 : 0)};
  transition: all 200ms ease-out;
  column-gap: 16px;
  align-items: center;
`;

export const ToasterMessage = styled.p`
  color: var(--mb-color-text-primary-inverse);
  min-width: 150px;
  max-width: 320px;
  flex: 1;
  line-height: 24px;
  font-size: 14px;
  margin: 0;
`;

export const ToasterButton = styled.button`
  display: flex;
  padding: 7px 18px;
  background-color: ${() => alpha("background-primary", 0.1)};
  border-radius: 6px;
  color: var(--mb-color-text-primary-inverse);
  height: fit-content;
  font-size: 14px;
  font-weight: bold;
  transition: background 200ms ease;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    cursor: pointer;
    background-color: ${() => alpha("background-primary", 0.3)};
  }
`;

export const ToasterDismiss = styled.button`
  cursor: pointer;
  transition: color 200ms ease;
  color: var(--mb-color-background-tertiary-inverse);

  &:hover {
    color: ${() => lighten("background-tertiary-inverse", 0.3)};
  }
`;
