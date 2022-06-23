import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";

const brandLight = lighten(color("brand"), 0.25);

export const Container = styled.div`
  --jse-font-family: inherit;

  --jse-theme-color: ${color("white")};
  --jse-theme-color-highlight: ${color("content")};
  --jse-menu-color: ${color("text-medium")};
  --jse-selection-background-color: ${color("brand")};
  --jse-selection-background-light-color: ${lighten(color("brand"), 0.5)};
  --jse-main-border: transparent;
  --jse-context-menu-background: ${color("white")};
  --jse-context-menu-button-background: ${color(brandLight)};
  --jse-context-menu-button-background-highlight: ${color("brand")};
  --jse-context-menu-background-highlight: ${brandLight};
  --jse-context-menu-color: ${color("text-dark")};
  --jse-context-menu-color-disabled: ${color("text-light")};
  --jse-context-menu-font-size: 0.75em;

  .jse-menu {
    .jse-button:disabled {
      color: ${color("text-light")} !important;
    }
  }

  .jse-context-menu {
    border-radius: 8px;
  }
`;
