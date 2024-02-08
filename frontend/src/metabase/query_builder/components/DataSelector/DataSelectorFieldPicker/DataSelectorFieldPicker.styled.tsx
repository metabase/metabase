import styled from "@emotion/styled";
import { Icon } from "metabase/ui";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  overflow-y: auto;
  width: 300px;
`;

export const HeaderContainer = styled.div`
  align-items: center;
  color: ${color("text-medium")};
  cursor: pointer;
  display: flex;
`;

export const HeaderName = styled.span`
  margin-left: ${space(1)};
  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;
`;

export const FieldName = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  flex-grow: 1;
  position: relative;
`;

export const PopoverHoverTarget = styled(Icon)`
  margin-left: 0.5em;
  right: -0.5em;
  position: absolute;
  padding: 0.7em 0.65em;
  opacity: 0;

  [role="option"]:hover & {
    opacity: 1;
  }
`;
