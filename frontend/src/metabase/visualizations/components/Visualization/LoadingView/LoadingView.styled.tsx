import styled from "@emotion/styled";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";

export const Root = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.5rem;
  color: ${color("brand")};
`;

export const SlowQueryMessageContainer = styled.div`
  color: ${color("text-medium")};
`;

export const ShortMessage = styled.span`
  font-weight: bold;
  font-size: 1.12em;
  margin-bottom: 0.5rem;
`;

export const Duration = styled.span`
  white-space: nowrap;
`;

export const StyledLoadingSpinner = styled(LoadingSpinner)`
  color: ${color("text-medium")};
`;
