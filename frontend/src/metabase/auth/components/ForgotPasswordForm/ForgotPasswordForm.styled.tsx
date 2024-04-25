import styled from "@emotion/styled";

import Link from "metabase/core/components/Link/Link";
import { color } from "metabase/lib/colors";

export const PasswordFormTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1.5rem;
`;

export const PasswordFormFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1.5rem;
`;

export const PasswordFormLink = styled(Link)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;
