import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { HoverParent } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const NodeListItemIcon = styled(Icon)`
  color: var(--mb-color-focus);
  margin-top: 1px;
  width: ${space(2)};
`;

interface NodeListItemLinkProps {
  disabled?: boolean;
}

export const NodeListItemLink = styled.a<NodeListItemLinkProps>`
  border-radius: 8px;
  align-items: center;
  color: var(--mb-color-brand);
  font-weight: 700;
  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;
  min-height: 2.2rem;
  display: flex;
  padding: ${space(1)};
  text-decoration: none;

  :hover {
    background-color: var(--mb-color-bg-medium);
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

export const NodeListItem = styled(HoverParent)`
  ${NodeListItemLink} {
    padding-top: 0;
    padding-bottom: 0;
    padding-right: 0;
  }
`;
