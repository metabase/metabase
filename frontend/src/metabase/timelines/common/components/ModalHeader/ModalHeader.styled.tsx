// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const HeaderLink = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  margin-right: auto;
  color: var(--mb-color-text-dark);
  cursor: ${(props) => props.onClick && "pointer"};

  &:hover {
    color: ${(props) => props.onClick && color("brand")};
  }
`;

interface HeaderTitleProps {
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

/**
 * Both the `height` and the `width` need to be in sync with `EntityMenuIconButton`
 * in order to prevent the header from visually jumping.
 * See: https://linear.app/metabase/issue/CLO-3660
 */
export const HeaderCloseButton = styled(IconButtonWrapper)`
  height: 36px;
  width: 36px;
  flex: 0 0 auto;
  color: var(--mb-color-text-light);
`;
