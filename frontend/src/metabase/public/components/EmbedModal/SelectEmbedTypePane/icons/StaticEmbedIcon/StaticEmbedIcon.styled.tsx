import styled from "@emotion/styled";

import { SharingPaneButtonContent } from "../../SharingPaneButton/SharingPaneButton.styled";

export const StaticEmbedIconRoot = styled.svg`
  color: var(--mb-color-bg-medium);

  .innerFill {
    fill: var(--mb-color-bg-dark);
    fill-opacity: 0.5;
  }

  ${SharingPaneButtonContent}:hover & {
    color: var(--mb-color-focus);

    .innerFill {
      fill: var(--mb-color-brand);
      fill-opacity: 1;
    }
  }
`;
