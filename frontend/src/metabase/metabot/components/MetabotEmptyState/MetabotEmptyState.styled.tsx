import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const EmptyStateRoot = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 0 auto;
`;

export const EmptyStateIcon = styled(Icon)`
  color: ${color("bg-dark")};
  width: 2.5rem;
  height: 2.5rem;
`;
