// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const AppBarRoot = styled.header<{ withBorder?: boolean }>`
  position: relative;
  z-index: 4;
  border-bottom: ${(props) =>
    props.withBorder ? "1px solid var(--mb-color-border)" : undefined};

  @media print {
    display: none;
  }
`;
