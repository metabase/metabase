import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

export const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const Description = styled.p`
  font-size: 1.143em;
  line-height: 1.5em;
  color: ${color("text-dark")};
  text-align: center;
  width: 80%;
  margin-top: 24px;
  margin-bottom: 24px;
`;

export const ButtonLink = styled(ExternalLink)`
  text-align: center;
`;

export const CenteredRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;
