import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const LinkRoot = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
`;

export const LinkText = styled.div`
  font-weight: bold;
`;

export const LinkIcon = styled(Icon)`
  color: ${color("white")};
  margin-left: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;
`;
