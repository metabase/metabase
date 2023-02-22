import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

export const ModalLink = styled(Link)`
  color: ${color("brand")};

  &:hover {
    text-decoration: underline;
  }
`;

export const ModalMessage = styled.div`
  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;
