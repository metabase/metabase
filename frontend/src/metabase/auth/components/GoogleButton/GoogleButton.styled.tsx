import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

export const GoogleButtonRoot = styled.div`
  display: flex;
  justify-content: center;
`;

export const AuthError = styled.div`
  color: ${color("error")};
  text-align: center;
`;

export const AuthErrorRoot = styled.div`
  margin-top: 1rem;
`;

export const TextLink = styled(Link)`
  cursor: pointer;
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;
