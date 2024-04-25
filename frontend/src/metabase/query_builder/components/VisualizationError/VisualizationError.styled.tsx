import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const QueryError = styled.div`
  overflow: auto;
`;

export const QueryErrorContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 100%;
`;

export const QueryErrorHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
`;

export const QueryErrorTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const QueryErrorIcon = styled(Icon)`
  flex: 0 0 auto;
  color: ${color("error")};
  width: 1rem;
  height: 1rem;
  margin-right: 0.75rem;
`;

export const QueryErrorMessage = styled.div`
  margin: 0 2rem;
  padding: 1rem;
  max-width: 31.25rem;
  font-family: ${monospaceFontFamily};
  font-size: 0.75rem;
  line-height: 1.125rem;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  overflow-wrap: break-word;
`;

export const QueryErrorLink = styled(ExternalLink)`
  color: ${color("brand")};
  margin: 1rem 0;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: bold;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
