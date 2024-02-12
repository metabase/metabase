import styled from "@emotion/styled";
import { FieldInfoIcon } from "metabase/components/MetadataInfo/FieldInfoIcon";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  overflow-y: auto;
  width: 300px;

  ${FieldInfoIcon.HoverTarget} {
    margin-left: 0.5em;
    right: 0.5em;
    position: absolute;
    padding: 0.7em 0.65em;
    opacity: 0;
    cursor: pointer;
  }

  [role="option"]:hover ${FieldInfoIcon.HoverTarget} {
    opacity: 1;
  }
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
