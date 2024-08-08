import styled from "@emotion/styled";

import ButtonsS from "metabase/css/components/buttons.module.css";
import { alpha, color } from "metabase/lib/colors";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Icon } from "metabase/ui";

export const Root = styled(FullWidthContainer)<{ admin: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  background-color: ${props =>
    alpha(color(props.admin ? "accent7" : "brand"), 0.85)};

  .${ButtonsS.Button} {
    color: ${color("text-white")};
    background-color: ${alpha(color("bg-white"), 0.1)};
    border: none;
    font-size: 1em;
    margin-left: 0.75em;
  }

  .${ButtonsS.ButtonPrimary} {
    color: ${props => color(props.admin ? "text-dark" : "brand")};
    background-color: ${color("bg-white")};
  }

  .${ButtonsS.Button}:hover {
    color: ${color("text-white")};
    background-color: ${props => color(props.admin ? "accent7" : "brand")};
  }
`;

export const EditIcon = styled(Icon)`
  color: ${color("text-white")};
  margin-right: 0.5rem;
`;

export const Title = styled.span`
  color: ${color("text-white")};
  font-weight: 700;
`;

export const Subtitle = styled.span`
  color: ${alpha(color("text-white"), 0.5)};
  margin-left: 0.5rem;
  margin-right: 0.5rem;
`;

export const ButtonsContainer = styled.div`
  display: flex;
`;
