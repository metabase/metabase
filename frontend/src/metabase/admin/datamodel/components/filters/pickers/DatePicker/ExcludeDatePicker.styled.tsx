import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import CheckBox from "metabase/core/components/CheckBox";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

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
  font-size: 1em;
  color: ${color("text-dark")};
  font-weight: 600;
  min-height: 1.5em;
`;

export const ExcludeLabel = styled.div`
  font-size: 1rem;
  margin-left: ${space(2)};
`;

export const ExcludeContainer = styled.div`
  display: flex;
  flex-wrap: no-wrap;
  grid-gap: ${space(3)};
`;

export const ExcludeColumn = styled.div`
  display: flex;
  flex-wrap: no-wrap;
  flex-direction: column;
  grid-gap: ${space(1)};
`;
