import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

import { color } from "metabase/lib/colors";

export const ErrorBox = styled.div`
  padding: 0.5rem 1rem;
  border-radius: 4px;

  color: ${color("text-dark")};
  background-color: ${color("bg-light")};

  font-family: Monaco, monospace;
  font-weight: 400;
  font-size: 12px;
  line-height: 20px;
`;

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

export const PaginationControlsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  margin: 1.5rem 0;
`;
