import styled from "@emotion/styled";
import { Link } from "react-router";
import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";

export const FieldNameInput = styled(InputBlurChange)`
  display: block;
  margin-bottom: 0.5rem;
  ${InputBlurChange.Field} {
    background-color: ${color("bg-light")};
  }
`;

export const BackButtonLink = styled(Link)`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  border-radius: 99px;
  color: ${color("white")};
  background-color: ${color("bg-dark")};

  &:hover {
    background-color: ${color("brand")};
  }
`;
