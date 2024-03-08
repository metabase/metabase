import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";
import { color } from "metabase/lib/colors";

export const LinkFooter = styled.div`
  margin-top: 1rem;
`;

export const LinkButton = styled(Button)`
  color: ${color("brand")};
  font-weight: normal;
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    text-decoration: underline;
    background-color: transparent;
  }
`;
