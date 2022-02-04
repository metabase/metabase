import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button";
import SpecificDatePicker from "metabase/query_builder/components/filters/pickers/SpecificDatePicker";

export const Container = styled.div`
  min-width: 300px;
`;

export const PaddedSpecificDatePicker = styled(SpecificDatePicker)`
  padding: ${space(1)};
`;

export const Footer = styled.div`
  border-top: 1px solid ${color("border")};
  padding: ${space(1)};
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
`;

export const UpdateButton = styled(Button).attrs({
  purple: true,
})`
  justify-self: end;
  grid-column-start: 2;
`;
