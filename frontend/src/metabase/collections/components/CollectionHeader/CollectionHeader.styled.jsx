import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: ${space(3)};
  padding-top: ${space(0)};

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: ${space(3)};
  }
`;

export const MenuContainer = styled.div`
  display: flex;
  margin-top: ${space(1)};
  align-self: start;
`;

export const ToggleMobileSidebarIcon = styled(Icon)`
  cursor: pointer;
  margin: ${space(0)} ${space(2)} 0 ${space(1)};

  ${breakpointMinSmall} {
    display: none;
  }
`;

ToggleMobileSidebarIcon.defaultProps = {
  name: "burger",
  size: 20,
};

export const DescriptionTooltipIcon = styled(Icon)`
  color: ${color("bg-dark")};
  margin-left: ${space(1)};
  margin-right: ${space(1)};
  margin-top: ${space(0)};

  &:hover {
    color: ${color("brand")};
  }
`;

DescriptionTooltipIcon.defaultProps = {
  name: "info",
};

export const DescriptionHeading = styled.div`
  font-size: 1rem;
  line-height: 1.5rem;
  padding-top: 1.15rem;
  max-width: 400px;
`;

export const TitleContent = styled.div`
  display: flex;
  align-items: center;
`;
