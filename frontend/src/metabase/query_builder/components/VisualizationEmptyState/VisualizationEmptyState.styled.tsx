import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const EmptyStateBody = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 22rem;
`;

export const EmptyStateTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: bold;
  line-height: 1.5rem;
  margin-bottom: 1rem;
`;

export const EmptyStateCaption = styled.div`
  color: ${color("text-light")};
  font-size: 1rem;
  font-weight: bold;
`;

export const EmptyStateMessage = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  line-height: 1.5rem;
  margin-bottom: 1rem;

  &:last-of-type {
    margin-bottom: 1.5rem;
  }
`;

export const EmptyStateLink = styled.span`
  cursor: pointer;
  color: ${color("brand")};
`;

export const EmptyStateRunButton = styled(RunButtonWithTooltip)`
  align-self: center;
  box-shadow: 0 2px 2px ${color("shadow")};
`;
