import styled from "styled-components";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const EditorContainer = styled.div`
  border: 1px solid;
  border-color: ${({ isFocused }) =>
    isFocused ? color("brand") : color("border")};
  border-radius: ${space(0)};
  display: flex;
  position: relative;
  margin: ${space(1)} 0;
  padding: ${space(1)};
`;

export const EditorEqualsSign = styled.div`
  font-family: Monaco, monospace;
  font-size: 12px;
  font-weight: 700;
  margin: 0 ${space(0)}};
`;
