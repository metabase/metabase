import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Button from "metabase/core/components/Button";

export const PickerButton = styled(Button)`
  display: block;
  border: none;
`;

export const TabContainer = styled.div`
  display: flex;
  flex-wrap: nowrap;
  border-bottom: 1px solid ${color("text-light")};
`;

type TabButtonProps = {
  selected?: boolean;
  primaryColor: string;
};

export const TabButton = styled(Button)<TabButtonProps>`
  border: none;
  border-bottom: ${props =>
    props.selected ? `2px solid ${props.primaryColor}` : "none"};
`;

export const Separator = styled.div`
  margin: 1rem;
  border-top: solid 1px ${color("text-light")};
  opacity: 0.5;
`;
