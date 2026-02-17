// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import LoadingSpinner from "metabase/common/components/LoadingSpinner";
import { color } from "metabase/ui/utils/colors";

export const StatusRoot = styled.div`
  width: 16rem;
  border-radius: 6px;
  background-color: var(--mb-color-background-primary);
  box-shadow: 0 1px 12px var(--mb-color-shadow);
  overflow: hidden;
  margin-top: 1rem;
  border: 1px solid var(--mb-color-border);
`;

export const StatusHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 0.625rem 1rem;
  background-color: var(--mb-color-brand);
`;

export const StatusTitle = styled.div`
  flex: 1 1 auto;
  width: 100%;
  color: var(--mb-color-background-secondary);
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
`;

export const StatusToggle = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: var(--mb-color-text-primary-inverse);
`;

export const StatusBody = styled.div`
  background-color: var(--mb-color-background-primary);
`;

export const StatusCardRoot = styled.div<{ hasBody?: boolean }>`
  display: flex;
  align-items: ${(props) => (props.hasBody ? "flex-start" : "center")};
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
  color: var(--mb-color-brand);
  background-color: var(--mb-color-background-brand);
`;

export const StatusCardTitle = styled.div`
  color: var(--mb-color-text-primary);
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
  overflow: hidden;
`;

export const StatusCardDescription = styled.div`
  color: var(--mb-color-background-tertiary-inverse);
  font-size: 0.6875rem;
  font-weight: bold;
  line-height: 0.8125rem;
  margin-top: 0.25rem;
`;

export const StatusCardSpinner = styled(LoadingSpinner)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mb-color-brand);
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
  color: var(--mb-color-text-primary-inverse);
  background-color: ${(props) =>
    props.isError ? color("error") : color("success")};
`;
