import styled from "@emotion/styled";

export interface WidgetRootProps {
  isExpanded?: boolean;
}

export const WidgetRoot = styled.div<WidgetRootProps>`
  padding: 1rem;
  width: ${props => (props.isExpanded ? "300px" : "260px")};
`;

export const WidgetHeader = styled.div`
  padding: 0.5rem;
`;

export const WidgetMessage = styled.div`
  padding: 0 0.5rem;
`;

export const WidgetFormat = styled.div`
  width: 100%;
`;
