import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const InfoLink = styled(ExternalLink)`
  margin-left: 4px;

  &:hover,
  :focus {
    color: ${color("brand")};
  }
`;

export const FieldTitleIcon = styled(Icon)`
  width: 12px;
  height: 12px;
`;

export const TooltipLabel = styled.span`
  display: inline-block;
  max-width: 20.75rem;
  white-space: normal;
`;
