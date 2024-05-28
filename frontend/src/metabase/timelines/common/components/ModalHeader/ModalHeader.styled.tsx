import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 2rem 0;
`;

export const HeaderLink = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  margin-right: auto;
  color: ${color("text-dark")};
  cursor: ${props => props.onClick && "pointer"};

  &:hover {
    color: ${props => props.onClick && color("brand")};
  }
`;

export interface HeaderTitleProps {
  tooltipMaxWidth?: string;
}

export const HeaderTitle = styled(Ellipsified)<HeaderTitleProps>`
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const HeaderBackIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const HeaderMenu = styled.div`
  margin-right: 1rem;
`;

export const HeaderCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-light")};
`;
