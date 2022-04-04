import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";
import { breakpointMinExtraLarge } from "metabase/styled-components/theme";

export const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-dark")};
  font-weight: bold;
  margin-bottom: 1.5rem;

  ${breakpointMinExtraLarge} {
    margin-bottom: 2rem;
  }
`;

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

export const XrayList = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
`;
