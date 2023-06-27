import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const SectionButton = styled(Button)`
  color: ${color("brand")};
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    background-color: transparent;
  }
`;
