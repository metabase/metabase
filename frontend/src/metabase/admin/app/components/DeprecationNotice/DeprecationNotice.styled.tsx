import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const NoticeRoot = styled.div`
  display: flex;
  padding: 1rem 1rem 1rem 1.5rem;
  align-items: center;
  background-color: ${color("bg-light")};
`;

export const NoticeContent = styled.div`
  flex: 1 1 auto;
  margin: 0 0.75rem;
  color: ${color("text-dark")};
`;

export const NoticeWarningIcon = styled(Icon)`
  color: ${color("accent5")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const NoticeCloseIcon = styled(Icon)`
  color: ${color("bg-dark")};
  cursor: pointer;

  &:hover {
    color: ${color("admin-navbar")};
  }
`;
