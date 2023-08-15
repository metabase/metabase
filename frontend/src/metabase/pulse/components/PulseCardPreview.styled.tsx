import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

interface AttachmentIconProps {
  hasAttachment?: boolean;
}

export const AttachmentIcon = styled(Icon)<AttachmentIconProps>`
  cursor: pointer;
  padding: 0.5rem 0.5rem 0.5rem 0;
  color: ${props => props.hasAttachment && color("brand")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const RemoveIcon = styled(Icon)`
  cursor: pointer;
  padding: 0.5rem 0.5rem 0.5rem 0;

  &:hover {
    color: ${color("brand")};
  }
`;
