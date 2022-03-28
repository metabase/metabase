import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 2rem 0;
`;

export interface HeaderTitleProps {
  tooltipMaxWidth?: string;
}

export const HeaderTitle = styled(Ellipsified)<HeaderTitleProps>`
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
  margin-right: 1rem;
`;

export const HeaderLink = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  color: ${color("text-dark")};
  min-width: 0;
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
