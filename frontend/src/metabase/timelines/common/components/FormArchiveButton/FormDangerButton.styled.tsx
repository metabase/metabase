import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button/Button";

export const ArchiveButton = styled(Button)`
  color: ${color("danger")};
  padding-left: 0;
  padding-right: 0;

  &:hover {
    color: ${color("danger")};
    background-color: transparent;
  }
`;
