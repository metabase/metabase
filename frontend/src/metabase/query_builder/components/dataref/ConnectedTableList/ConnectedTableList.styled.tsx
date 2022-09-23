import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import { space } from "metabase/styled-components/theme";

export const InteractiveTableLabel = styled.div`
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
`;
