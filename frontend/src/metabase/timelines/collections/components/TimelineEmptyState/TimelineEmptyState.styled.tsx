import styled from "@emotion/styled";

import DateTime from "metabase/components/DateTime";
import { alpha, color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const EmptyStateBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 22.5rem;
`;

export const EmptyStateChart = styled.div`
  color: ${color("brand")};
  margin-bottom: -1rem;
`;

export const EmptyStateTooltip = styled.div`
  display: flex;
  align-items: center;
  min-width: 16.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border-radius: 0.5rem;
  background-color: ${color("text-dark")};
`;

export const EmptyStateTooltipIcon = styled(Icon)`
  flex: 0 0 auto;
  color: ${color("white")};
  width: 1rem;
  height: 1rem;
`;

export const EmptyStateTooltipBody = styled.div`
  flex: 1 1 auto;
  margin-left: 1rem;
`;

export const EmptyStateTooltipTitle = styled.div`
  color: ${color("white")};
  font-weight: bold;
  margin-bottom: 0.25rem;
`;

export const EmptyStateTooltipDate = styled(DateTime)`
  display: block;
  color: ${color("white")};
`;

export const EmptyStateThread = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const EmptyStateThreadLine = styled.div`
  margin: 0 0.5rem;
  width: 11.75rem;
  height: 1px;
  background-color: ${alpha("brand", 0.2)};
`;

export const EmptyStateThreadIcon = styled(Icon)`
  color: ${color("white")};
  width: 1rem;
  height: 1rem;
`;

export const EmptyStateThreadIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 1rem;
  background-color: ${color("brand")};
`;

export const EmptyStateMessage = styled.div`
  color: ${color("text-dark")};
  line-height: 1.5rem;
  margin-bottom: 2rem;
  text-align: center;
`;
