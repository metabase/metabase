import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { isDesktopSafari } from "metabase/lib/browser";

interface SharedProps {
  isNarrow: boolean;
}

export const Title = styled.div``;
export const Subtitle = styled.div``;

interface FunnelStepProps {
  isFirst?: boolean;
}
export const FunnelStep = styled.div<FunnelStepProps>`
  width: 100%;
  min-width: 20px;
  border-right: 1px solid var(--mb-color-border);
  display: flex;
  flex-direction: column;

  ${props =>
    props.isFirst
      ? css`
          min-width: unset;
          width: unset;
        `
      : null}
`;

export const Head = styled.div<SharedProps>`
  text-align: right;
  padding: 0.5em;
  min-width: 0;

  ${props =>
    props.isNarrow
      ? css`
          font-size: 0.85em;
        `
      : null}
`;

export const Info = styled.div<SharedProps>`
  text-align: right;
  padding: 0.5em 0.5em 0 0.5em;
  font-size: ${props => (props.isNarrow ? "0.85em" : "1.15em")};

  ${Subtitle} {
    font-size: ${props => (props.isNarrow ? "0.875em" : "0.6875em")};
    margin-top: 1em;
  }
`;

export const FunnelStart = styled.div<SharedProps>`
  display: flex;
  justify-content: center;
  flex-direction: column;
  text-align: right;
  flex-grow: 1;

  padding-right: 0.5em;
  font-size: 1.72em;

  ${Title} {
    font-weight: bold;
    color: var(--mb-color-text-dark);
    ${props =>
      props.isNarrow
        ? css`
            font-size: 0.75em;
          `
        : null}
  }

  ${Subtitle} {
    font-size: 0.6875em;

    ${props =>
      props.isNarrow
        ? css`
            font-size: 0.5em;
          `
        : null}
  }
`;

interface FunnelNormalRootProps {
  isNarrow: boolean;
  isSmall: boolean;
}

export const FunnelNormalRoot = styled.div<FunnelNormalRootProps>`
  display: flex;
  padding: ${props => (props.isSmall ? "0.5rem" : "1rem")};
  color: var(--mb-color-text-medium);

  ${isDesktopSafari()
    ? css`
        will-change: transform;
      `
    : null}
`;
