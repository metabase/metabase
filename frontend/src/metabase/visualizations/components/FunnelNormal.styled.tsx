import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface FunnelRootProps {
  isSmall: boolean;
  isNarrow: boolean;
}

const narrowFunnelStyles = css`
  .Head {
    font-size: 12px;
  }

  .Infos {
    font-size: 12px;
  }

  .Infos .Subtitle {
    font-size: 0.875em;
  }

  .Start .Title {
    font-size: 0.75em;
  }

  .Start .Subtitle {
    font-size: 0.5em;
  }
`;

export const FunnelRoot = styled.div<FunnelRootProps>`
  display: flex;
  color: ${color("text-medium")};
  padding: ${props => (props.isSmall ? "0.5rem" : "1rem")};
  ${props => (props.isNarrow ? narrowFunnelStyles : null)}
`;
