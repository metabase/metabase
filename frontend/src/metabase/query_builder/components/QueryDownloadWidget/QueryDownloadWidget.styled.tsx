import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

export const DownloadIcon = styled(Icon)`
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;
