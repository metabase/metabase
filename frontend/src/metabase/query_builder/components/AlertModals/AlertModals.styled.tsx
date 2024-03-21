import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const AlertModalFooter = styled.div`
  display: flex;
  justify-content: right;
  align-items: center;
  margin-top: ${space(3)};
`;

export const DangerZone = styled.div`
  ${Button.Root} {
    opacity: 0.4;
    background: ${color("bg-light")};
    border: 1px solid ${color("border")};
    color: ${color("text-dark")};
    transition: none;
  }

  &:hover {
    border-color: ${color("accent3")};
    transition: border 0.3s ease-in;

    ${Button.Root} {
      opacity: 1;
      background-color: ${color("accent3")};
      border-color: ${color("accent3")};
      color: ${color("text-white")};
    }
  }
`;
