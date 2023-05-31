import styled from "@emotion/styled";
import Button from "metabase/core/components/Button/Button";
import ExternalLink from "metabase/core/components/ExternalLink";

import { color } from "metabase/lib/colors";

// This color is only used here, so I'm reluctant to add it to the color palette.
const VIBRANT_BLUE = "#1888EC";

export const DatabasePromptBannerRoot = styled.div`
  background: ${VIBRANT_BLUE};
  color: ${color("white")};
  display: flex;
  align-items: center;
`;

export const Prompt = styled.div`
  padding: 1rem 1.5rem;
`;

export const CallToActions = styled.div`
  margin-left: auto;
`;

export const GetHelpButton = styled(ExternalLink)`
  font-size: 12px;
  margin-right: 1.125rem;
  text-decoration: underline;
`;

export const ConnectDatabaseButton = styled(Button)`
  margin-right: 0.5625rem;
  background-color: ${color("white")};
  color: ${VIBRANT_BLUE};
`;
