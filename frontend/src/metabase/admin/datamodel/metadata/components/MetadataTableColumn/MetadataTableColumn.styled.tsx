import styled from "@emotion/styled";
import { Link } from "react-router";

import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";

export const ColumnContainer = styled.section`
  padding: 1rem 0.5rem 1rem 1rem;
  margin-top: 0.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  border: 1px solid ${color("border")};
  border-radius: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  background: ${color("white")};
`;

export const ColumnInput = styled(InputBlurChange)`
  width: auto;
`;

export const FieldSettingsLink = styled(Link)`
  margin-right: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
