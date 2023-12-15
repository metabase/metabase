import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Card from "metabase/components/Card";

export const StyledCard = styled(Card)`
  padding: 2rem;
  width: 100%;
  max-width: 34rem;
`;

export const Label = styled.span`
  padding: ${space(0)} ${space(1)};
  display: inline-block;

  line-height: 1.3;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.25rem;
  text-transform: uppercase;
  color: ${color("white")};
  background: ${color("brand")};
`;
