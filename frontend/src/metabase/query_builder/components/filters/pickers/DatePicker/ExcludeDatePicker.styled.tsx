import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";
import CheckBox from "metabase/core/components/CheckBox";

type OptionButtonProps = {
  primaryColor?: string;
  selected?: boolean;
};

export const OptionButton = styled(Button)<OptionButtonProps>`
  display: block;
  color: ${({ primaryColor = color("brand"), selected }) =>
    selected ? primaryColor : undefined};
  border: none;
  &:hover {
    color: ${props => props.primaryColor || color("brand")};
    background: none;
  }
`;

export const Separator = styled.div`
  margin: 1rem;
  border-top: solid 1px ${color("text-light")};
  opacity: 0.5;
`;

export const ExcludeCheckBox = styled(CheckBox)`
  margin: ${space(1)} ${space(2)};
`;

export const ExcludeLabel = styled.div`
  font-size: 1rem;
  margin-left: ${space(2)};
`;
