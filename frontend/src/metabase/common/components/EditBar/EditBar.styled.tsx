import isPropValid from "@emotion/is-prop-valid";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Icon } from "metabase/ui";
import { alpha } from "metabase/ui/colors";
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
    alpha(props.admin ? "accent7" : "core-brand", 0.85)};
`;

export const EditIcon = styled(Icon)`
  color: var(--mb-color-text-primary-inverse);
`;

export const Title = styled.span`
  color: var(--mb-color-text-primary-inverse);
  font-weight: 700;
`;

/* restyles metabase/ui buttons for the colored bar: filled = primary, subtle = secondary */
export const ButtonsContainer = styled("div", {
  shouldForwardProp: isPropValid,
})<{ admin: boolean }>`
  display: flex;

  button[data-variant] {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${() => alpha("background_page-primary", 0.1)};
    border: none;
    font-size: 1em;
    margin-left: 0.75em;
  }

  button[data-variant="filled"] {
    color: ${(props) => color(props.admin ? "text-primary" : "core-brand")};
    background-color: var(--mb-color-background_page-primary);
  }

  button[data-variant]:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${(props) =>
      color(props.admin ? "accent7" : "core-brand")};
  }
`;
