import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const PasswordFormTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
`;

export const PasswordFormMessage = styled.div`
  color: ${color("text-dark")};
  text-align: center;
  margin-bottom: 1.5rem;
`;
