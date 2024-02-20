import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 10rem;
`;

export const EmptyStateIcon = styled(Icon)`
  color: ${color("text-light")};
  width: 5rem;
  height: 5rem;
  margin-bottom: 2.5rem;
`;

export const EmptyStateText = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  line-height: 1.5rem;
  text-align: center;
  max-width: 19.375rem;
`;

export const EmptyStateButton = styled(Button)`
  margin-top: 1.5rem;
`;
