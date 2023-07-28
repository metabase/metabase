import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const GoogleButtonRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const AuthError = styled.div`
  color: ${color("error")};
  text-align: center;
`;

export const AuthErrorContainer = styled.div`
  margin-top: 1rem;
`;
