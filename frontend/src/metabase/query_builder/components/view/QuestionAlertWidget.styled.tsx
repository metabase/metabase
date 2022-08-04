import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ViewAlertIcon = styled(Icon)`
  color: ${color("brand")};
  cursor: pointer;
`;

export const CreateAlertIcon = styled(Icon)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
