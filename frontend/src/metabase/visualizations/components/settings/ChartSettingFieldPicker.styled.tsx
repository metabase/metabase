import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const RemoveIcon = styled(Icon)`
  margin-left: 0.5rem;
  color: ${color("text-medium")};
  cursor: pointer;
  visibility: ${props => (props.onClick ? "visible" : "hidden")};

  &:hover {
    color: ${color("brand")};
  }
`;
