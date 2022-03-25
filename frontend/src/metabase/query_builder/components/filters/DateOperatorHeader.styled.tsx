import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";

export const Container = styled.div`
  display: flex;
  flex-wrap: nowrap;
  padding-left: ${space(1)};
`;

type TabButtonProps = {
  selected?: boolean;
  primaryColor?: string;
};

export const TabButton = styled(Button)<TabButtonProps>`
  border: none;
  border-radius: 0;
  padding-left: 0;
  padding-right: 0;
  margin-left: ${space(2)};
  margin-right: ${space(2)};
  border-bottom: ${props =>
    props.selected
      ? `2px solid ${props.primaryColor || color("brand")}`
      : "none"};

  color: ${props =>
    props.selected
      ? `${props.primaryColor || color("brand")}`
      : color("text-medium")};

  &:hover {
    background: none;
  }
`;

export const BackButton = styled(TabButton)`
  border: none;
  border-radius: 0;
  margin-left: ${space(1)};
  color: ${color("text-medium")};

  &:hover {
    color: ${props => props.primaryColor || color("brand")};
  }
`;
