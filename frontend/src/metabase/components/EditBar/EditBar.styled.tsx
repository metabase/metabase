// eslint-disable-next-line no-restricted-imports
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
    color: var(--mb-color-text-white);
    background-color: ${() => alpha(color("bg-white"), 0.1)};
    border: none;
    font-size: 1em;
    margin-left: 0.75em;
  }

  .${ButtonsS.ButtonPrimary} {
    color: ${props => color(props.admin ? "text-dark" : "brand")};
    background-color: var(--mb-color-bg-white);
  }

  .${ButtonsS.Button}:hover {
    color: var(--mb-color-text-white);
    background-color: ${props => color(props.admin ? "accent7" : "brand")};
  }
`;

export const EditIcon = styled(Icon)`
  color: var(--mb-color-text-white);
`;

export const Title = styled.span`
  color: var(--mb-color-text-white);
  font-weight: 700;
`;

export const ButtonsContainer = styled.div`
  display: flex;
`;
