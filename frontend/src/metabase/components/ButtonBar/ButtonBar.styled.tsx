import styled from "@emotion/styled";
import type { ReactNode } from "react";

export const ButtonBarRoot = styled.div`
  display: flex;
  align-items: center;
`;

export interface ButtonBarLeftProps {
  center?: ReactNode;
}

export const ButtonBarLeft = styled.div<ButtonBarLeftProps>`
  display: flex;
  flex: ${props => (props.center ? "1 0 0" : "")};
  justify-content: flex-start;
  align-items: center;
  margin-right: ${props => (props.center ? "" : "auto")};
`;

export const ButtonBarCenter = styled.div`
  display: flex;
  align-items: center;
`;

export interface ButtonBarRightProps {
  center?: ReactNode;
}

export const ButtonBarRight = styled.div<ButtonBarRightProps>`
  display: flex;
  flex: ${props => (props.center ? "1 0 0" : "")};
  gap: 1rem;
  justify-content: flex-end;
  align-items: center;
  margin-left: ${props => (props.center ? "" : "auto")};
`;
