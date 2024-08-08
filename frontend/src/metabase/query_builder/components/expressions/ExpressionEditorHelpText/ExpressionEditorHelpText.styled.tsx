import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const Container = styled.div`
  padding: 1.25rem 1rem 1.25rem;
  font-size: 0.875rem;
  line-height: 1.5rem;
`;

export const FunctionHelpCode = styled.div`
  color: ${color("text-dark")};
  font-family: ${monospaceFontFamily};
  font-size: 0.8125rem;
  line-height: 1.065rem;
`;

export const FunctionHelpCodeArgument = styled.span`
  color: ${color("accent3")};
`;

export const Divider = styled.div`
  height: 1px;
  background-color: ${color("border")};
  margin: 1.25rem -1rem 1rem -1rem;
`;

export const ArgumentsGrid = styled.div`
  margin: 1rem 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(4rem, max-content));
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export const ArgumentTitle = styled.div`
  color: ${color("accent3")};
  font-family: ${monospaceFontFamily};
  font-size: 0.8125rem;
  text-align: right;
`;

export const BlockSubtitleText = styled.div`
  margin-bottom: 0.5rem;
  color: ${color("text-light")};
`;

export const ExampleCode = styled.div`
  padding: 0.5rem;
  background-color: ${color("bg-light")};
  border-radius: 8px;
  font-size: 0.8125rem;
  line-height: 1.065rem;
  font-family: ${monospaceFontFamily};
`;

export const DocumentationLink = styled(ExternalLink)`
  display: flex;
  align-items: center;
  margin-top: 1rem;
  color: ${color("brand")};
  font-weight: 700;
`;

export const LearnMoreIcon = styled(Icon)`
  margin: 0.25rem 0.5rem;
`;
