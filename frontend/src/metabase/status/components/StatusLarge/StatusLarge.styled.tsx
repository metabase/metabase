import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

export const StatusRoot = styled.div`
  width: 16rem;
  border-radius: 6px;
  background-color: ${color("white")};
  box-shadow: 0 1px 12px ${color("shadow")};
  overflow: hidden;
  margin-top: 1rem;
`;

export const StatusHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 0.625rem 1rem;
  background-color: ${color("brand")};
`;

export const StatusTitle = styled.div`
  flex: 1 1 auto;
  width: 100%;
  color: ${color("bg-light")};
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
`;

export const StatusToggle = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("white")};
`;

export const StatusBody = styled.div`
  background-color: ${color("white")};
`;

export const StatusCardRoot = styled.div<{ hasBody?: boolean }>`
  display: flex;
  align-items: ${props => (props.hasBody ? "flex-start" : "center")};
  margin: 0.75rem;
`;

export const StatusCardBody = styled.div`
  flex: 1 1 auto;
  margin: 0 0.75rem;
  overflow: hidden;
`;

export const StatusCardIcon = styled.div`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 1rem;
  color: ${color("brand")};
  background-color: ${color("brand-light")};
`;

export const StatusCardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
  overflow: hidden;
`;

export const StatusCardDescription = styled.div`
  color: ${color("bg-dark")};
  font-size: 0.6875rem;
  font-weight: bold;
  line-height: 0.8125rem;
  margin-top: 0.25rem;
`;

export const StatusCardSpinner = styled(LoadingSpinner)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("brand")};
`;

interface StatusCardIconContainerProps {
  isError?: boolean;
}

export const StatusCardIconContainer = styled.div<StatusCardIconContainerProps>`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 1rem;
  color: ${color("white")};
  background-color: ${props => color(props.isError ? "error" : "success")};
`;
