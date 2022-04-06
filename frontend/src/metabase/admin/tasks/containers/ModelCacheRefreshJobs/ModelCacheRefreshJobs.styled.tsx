import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

import { color } from "metabase/lib/colors";

export const StyledLink = styled(Link)`
  color: ${color("brand")};
`;

export const IconButtonContainer = styled.button`
  cursor: pointer;

  .Icon {
    color: ${color("text-light")};
  }

  &:hover {
    .Icon {
      color: ${color("text-dark")};
    }
  }
`;
