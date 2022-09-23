import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FieldListItemName = styled.span`
  font-weight: 700;
`;

export const FieldListIcon = styled(Icon)`
  margin-top: 1px;
  width: ${space(2)};
`;

export const FieldListItemIcon = styled(Icon)`
  color: ${color("focus")};
  margin-top: 1px;
  width: ${space(2)};
`;

export const FieldListItem = styled.li`
  a {
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
  }
  ${FieldListItemName} {
    margin-left: ${space(1)};
  }
`;

export const FieldListContainer = styled.ul`
  padding-top: ${space(2)};
`;

export const FieldListTitle = styled.div`
  display: flex;
  align-items: center;
  font-weight: 700;
  padding: ${space(1)} ${space(1)} ${space(1)} 6px;
`;

export const FieldListTitleText = styled.span`
  margin-left: ${space(1)};
`;
