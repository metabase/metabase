import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import ExternalLink from "metabase/core/components/ExternalLink";

export const QueryError = styled.div`
  display: flex;
  overflow: auto;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const QueryErrorIcon = styled.div`
  color: ${color("error")};
  margin-bottom: ${space(2)};
`;

export const QueryErrorMessage = styled.div`
  color: ${color("error")};
  max-width: 31.25rem;
  min-height: 0;
`;

export const QueryLink = styled(ExternalLink)`
  display: block;
  margin-top: ${space(1)};
  text-decoration: underline;
  color: ${color("text-medium")};
`;
