import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const CustomMapContainer = styled.div`
  border-top: 1px solid ${color("border")};
  padding: 0.375rem 0.75rem;

  ${Button.Root} {
    padding: 0.5rem 0.75rem;

    &:hover {
      background-color: ${color("white")};
    }
  }

  ${Button.Content} {
    justify-content: space-between;
    color: ${color("text-dark")};
  }
`;
