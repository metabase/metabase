import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";
import { Icon } from "metabase/ui";

export const DownloadIcon = styled(Icon)`
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
    cursor: pointer;
  }
`;
