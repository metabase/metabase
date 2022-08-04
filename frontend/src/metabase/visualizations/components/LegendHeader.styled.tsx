import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const AddSeriesIcon = styled(Icon)`
  margin: 0 0.5rem;
  padding: 0.3125rem;
  flex-shrink: 0;
  color: ${color("text-medium")};
  border-radius: 0.5rem;
  background-color: ${color("bg-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
