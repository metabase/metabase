import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const StyledCard = styled(Card)`
  padding: 2.5rem;
  width: 100%;
  max-width: 40rem;
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

export const BoldExternalLink = styled(ExternalLink)`
  color: ${color("brand")};
  font-weight: bold;
`;
