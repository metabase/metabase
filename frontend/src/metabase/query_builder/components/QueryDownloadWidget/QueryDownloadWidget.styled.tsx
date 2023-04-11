import styled from "@emotion/styled";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const DownloadIconButton = styled(IconButtonWrapper)`
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;
