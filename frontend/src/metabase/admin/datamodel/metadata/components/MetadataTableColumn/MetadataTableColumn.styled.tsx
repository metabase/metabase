import styled from "@emotion/styled";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import InputBlurChange from "metabase/components/InputBlurChange";

export const ColumnInput = styled(InputBlurChange)`
  width: auto;
`;

export const FieldSettingsLink = styled(Link)`
  margin-right: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
