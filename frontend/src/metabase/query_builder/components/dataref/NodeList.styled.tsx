import { css } from "@emotion/react";
import styled from "@emotion/styled";

import {
  HoverParent,
  TableColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

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

interface NodeListItemLinkProps {
  disabled?: boolean;
}

export const NodeListItemLink = styled.a<NodeListItemLinkProps>`
  border-radius: 8px;
  align-items: center;
  color: ${color("brand")};
  font-weight: 700;
  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;
  min-height: 2.2rem;
  display: flex;
  padding: ${space(1)};
  text-decoration: none;

  :hover {
    background-color: ${color("bg-medium")};
  }

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
      color: inherit;

      ${NodeListItemIcon} {
        color: inherit;
      }
    `};
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

export const NodeListInfoIcon = styled(TableColumnInfoIcon)`
  margin-left: auto;
`;

export const NodeListItem = styled(HoverParent)`
  ${NodeListItemLink} {
    padding-top: 0;
    padding-bottom: 0;
    padding-right: 0;
  }
`;
