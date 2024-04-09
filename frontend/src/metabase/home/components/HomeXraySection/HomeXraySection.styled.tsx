import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const SectionBody = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
`;

export const DatabaseLink = styled(Link)`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
`;

export const DatabaseLinkIcon = styled(Icon)`
  color: ${color("focus")};
  width: 1rem;
  height: 1rem;
  margin-right: 0.25rem;
`;

export const DatabaseLinkText = styled.span`
  color: ${color("brand")};
  font-weight: bold;
`;

export const SchemaTrigger = styled.span`
  display: flex;
  align-items: center;
  margin: 0 0.5rem;
  cursor: pointer;
`;

export const SchemaTriggerIcon = styled(Icon)`
  color: ${color("brand")};
  width: 0.625rem;
  height: 0.625rem;
  margin-left: 0.25rem;
`;

export const SchemaTriggerText = styled.span`
  color: ${color("brand")};
  font-weight: bold;
`;
