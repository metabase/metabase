import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

export const DatabaseLink = styled(Link)`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
`;

export const DatabaseIcon = styled(Icon)`
  color: ${color("focus")};
  width: 1rem;
  height: 1rem;
  margin-right: 0.25rem;
`;

export const DatabaseTitle = styled.span`
  color: ${color("brand")};
  font-weight: bold;
`;

export const SectionBody = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
`;
