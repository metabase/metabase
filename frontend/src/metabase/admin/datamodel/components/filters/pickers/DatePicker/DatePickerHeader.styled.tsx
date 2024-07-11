import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

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
  border-bottom: ${({ primaryColor = color("brand"), selected }) =>
    selected ? `2px solid ${primaryColor}` : "2px solid transparent"};
  color: ${({ primaryColor = color("brand"), selected }) =>
    selected ? primaryColor : color("text-medium")};

  &:hover {
    background: none;
    color: ${({ primaryColor = color("brand") }) => primaryColor};
    border-color: ${({ primaryColor = color("brand") }) => primaryColor};
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
