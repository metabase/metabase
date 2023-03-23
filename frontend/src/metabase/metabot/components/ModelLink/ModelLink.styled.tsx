import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link/Link";

export const ModelLinkRoot = styled(Link)`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
`;

export const ModelLinkIcon = styled(Icon)`
  color: ${color("focus")};
  width: 1rem;
  height: 1rem;
  margin-right: 0.25rem;
`;

export const ModelLinkText = styled.span`
  color: ${color("brand")};
  font-weight: bold;
`;
