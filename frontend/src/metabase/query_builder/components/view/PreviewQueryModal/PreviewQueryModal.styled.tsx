import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

export const ModalExternalLink = styled(ExternalLink)`
  color: ${color("brand")};
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: bold;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
