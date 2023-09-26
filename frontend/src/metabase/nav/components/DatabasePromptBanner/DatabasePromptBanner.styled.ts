import styled from "@emotion/styled";
import Button from "metabase/core/components/Button/Button";
import ExternalLink from "metabase/core/components/ExternalLink";

import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

// This color is only used here, so I'm reluctant to add it to the color palette.
const VIBRANT_BLUE = "#1888EC";

export const DatabasePromptBannerRoot = styled.div`
  background: ${VIBRANT_BLUE};
  color: ${color("white")};
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  ${breakpointMinSmall} {
    flex-wrap: nowrap;
  }
`;

export const Prompt = styled.div`
  margin: 1rem 1.5rem 0.625rem;
  width: 100%;

  ${breakpointMinSmall} {
    width: auto;
    margin-bottom: 1rem;
  }
`;

export const CallToActions = styled.div`
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  white-space: nowrap;

  ${breakpointMinSmall} {
    margin-right: 0;
    margin-bottom: 0;
  }
`;

export const GetHelpButton = styled(ExternalLink)`
  font-size: 12px;
  margin-right: 1.125rem;
  text-decoration: underline;
`;

export const ConnectDatabaseButton = styled(Button)`
  background-color: ${color("white")};
  color: ${VIBRANT_BLUE};

  ${breakpointMinSmall} {
    margin-right: 0.5625rem;
  }
`;
