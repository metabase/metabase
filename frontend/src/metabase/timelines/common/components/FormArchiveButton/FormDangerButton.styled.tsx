import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";
import { color } from "metabase/lib/colors";

export const ArchiveButton = styled(Button)`
  color: ${color("danger")};
  padding-left: 0;
  padding-right: 0;

  &:hover {
    color: ${color("danger")};
    background-color: transparent;
  }
`;
