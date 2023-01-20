import styled from "@emotion/styled";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { breakpointMinMedium } from "metabase/styled-components/theme";

export const MetabaseLink = styled(ExternalLink)`
  display: flex;
  align-items: center;

  font-size: 0.85rem;
  font-weight: bold;
  text-decoration: none;
`;

export const Message = styled.span`
  color: ${color("text-medium")};

  margin-left: 0.5rem;
  ${breakpointMinMedium} {
    margin-left: 1rem;
  }
`;

export const MetabaseName = styled.span<{ isDark: boolean }>`
  color: ${props => color(props.isDark ? "white" : "brand")};
`;
