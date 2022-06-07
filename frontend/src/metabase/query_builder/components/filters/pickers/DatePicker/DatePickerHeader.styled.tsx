import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";

export const Container = styled.div`
  display: flex;
  flex-wrap: nowrap;
  padding-left: ${space(1)};
  border-bottom: 1px solid ${color("border")};
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
  border-bottom: ${({ primaryColor = defaultColor, selected }) =>
    selected ? `2px solid ${primaryColor}` : "2px solid transparent"};

  color: ${({ primaryColor = defaultColor, selected }) =>
    selected ? primaryColor : color("text-medium")};

  &:hover {
    background: none;
    color: ${({ primaryColor = defaultColor }) => primaryColor};
    border-color: ${({ primaryColor = defaultColor }) => primaryColor};
  }
`;

export const BackButton = styled(TabButton)`
  border: none;
  border-radius: 0;
  margin-left: ${space(1)};
  color: ${color("text-medium")};

  &:hover {
    color: ${({ primaryColor }) => primaryColor};
  }
`;

const defaultColor = color("brand");
