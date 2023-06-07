import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const NodeListItemName = styled.span`
  font-weight: 700;
  margin-left: ${space(1)};
`;

export const NodeListIcon = styled(Icon)`
  margin-top: 1px;
  width: ${space(2)};
`;

export const NodeListItemIcon = styled(Icon)`
  color: ${color("focus")};
  margin-top: 1px;
  width: ${space(2)};
`;

export const NodeListItemLink = styled.a`
  border-radius: 8px;
  display: flex;
  align-items: center;
  color: ${color("brand")};
  font-weight: 700;
  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;
  display: flex;
  padding: ${space(1)};
  text-decoration: none;
  :hover {
    background-color: ${color("bg-medium")};
  }
`;

export const NodeListContainer = styled.ul`
  padding-top: ${space(2)};
`;

export const NodeListTitle = styled.div`
  display: flex;
  align-items: center;
  font-weight: 700;
  padding: ${space(1)} ${space(1)} ${space(1)} 6px;
`;

export const NodeListTitleText = styled.span`
  margin-left: ${space(1)};
`;

export const QuestionId = styled.span`
  font-size: 0.75rem;
  color: ${color("text-medium")};
  margin-left: ${space(0)};
`;
