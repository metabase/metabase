import isPropValid from "@emotion/is-prop-valid";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import ButtonsS from "metabase/css/components/buttons.module.css";
import { alpha } from "metabase/lib/colors";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const Root = styled(FullWidthContainer, {
  shouldForwardProp: isPropValid,
})<{ admin: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  background-color: ${(props) =>
    alpha(props.admin ? "accent7" : "brand", 0.85)};

  .${ButtonsS.Button} {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${() => alpha("background-primary", 0.1)};
    border: none;
    font-size: 1em;
    margin-left: 0.75em;
  }

  .${ButtonsS.ButtonPrimary} {
    color: ${(props) => color(props.admin ? "text-primary" : "brand")};
    background-color: var(--mb-color-background-primary);
  }

  .${ButtonsS.Button}:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${(props) => color(props.admin ? "accent7" : "brand")};
  }
`;

export const EditIcon = styled(Icon)`
  color: var(--mb-color-text-primary-inverse);
`;

export const Title = styled.span`
  color: var(--mb-color-text-primary-inverse);
  font-weight: 700;
`;

export const ButtonsContainer = styled.div`
  display: flex;
`;
