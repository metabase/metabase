import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

import TableLabel from "../TableLabel/TableLabel";

export const InteractiveTableLabel = styled(TableLabel)`
  color: ${color("text-light")};
`;

export const LabelButton = styled.button`
  cursor: pointer;
  text-align: left;

  &:hover,
  &:focus {
    ${InteractiveTableLabel} {
      color: ${color("brand")};
    }
  }
`;

export const LabelLink = styled(Link)`
  &:hover,
  &:focus {
    ${InteractiveTableLabel} {
      color: ${color("brand")};
    }
  }
`;
