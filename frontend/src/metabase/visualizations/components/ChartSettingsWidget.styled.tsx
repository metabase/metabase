// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const Root = styled.div<{
  inline?: boolean;
}>`
  margin-inline: 1.5rem;
  margin-bottom: 1.5rem;

  ${(props) =>
    props.hidden &&
    css`
      display: none;
    `}

  ${(props) =>
    props.inline &&
    !props.hidden &&
    css`
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      /* justify-content: space-between has no floor -- once the title's width
         approaches the row's, the widget ends up flush against it with no
         visible gap at all (metabase#78685). gap guarantees a minimum. */
      gap: var(--mantine-spacing-sm);
    `}
`;
