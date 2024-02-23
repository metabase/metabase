import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 4rem;
`;

export const EmptyStateIcon = styled(Icon)`
  color: ${color("text-medium")};
  width: 5rem;
  height: 5rem;
  margin-bottom: 2.5rem;
`;

export const EmptyStateText = styled.div`
  color: ${color("text-medium")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;
