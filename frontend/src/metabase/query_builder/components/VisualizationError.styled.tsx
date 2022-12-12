import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import ExternalLink from "metabase/core/components/ExternalLink";
import { monospaceFontFamily } from "metabase/styled-components/theme";

export const QueryError = styled.div`
  display: flex;
  overflow: auto;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const QueryErrorHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
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
`;

export const QueryErrorLink = styled(ExternalLink)`
  color: ${color("brand")};
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: bold;
  text-decoration: none;
  margin-top: 1.5rem;

  &:hover {
    text-decoration: underline;
  }
`;
