import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const CardIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: ${color("accent4")};
  width: 1.25rem;
  height: 1.25rem;
`;

export const CardTitle = styled(Ellipsified)`
  font-size: 1rem;
  font-weight: bold;
  margin-left: 0.5rem;
  padding-right: 0.2rem;
`;

export const CardTitlePrimary = styled.span`
  color: ${color("text-dark")};
`;

export const CardTitleSecondary = styled.span`
  color: ${color("text-medium")};
`;
