import styled from "@emotion/styled";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const Container = styled.div`
  padding: 1.5rem;

  font-size: 0.875rem;
`;

export const FunctionHelpCode = styled.div`
  padding: 0.75rem 1rem 0.75rem;
  margin: 0.5rem 0 1.5rem;

  background-color: ${color("bg-light")};

  color: ${color("text-dark")};
  font-family: ${monospaceFontFamily};
`;

export const FunctionHelpCodeArgument = styled.span`
  color: ${color("brand")};
`;

export const ExampleBlock = styled.div`
  color: ${color("text-light")};
`;

export const ExampleTitleText = styled.div`
  margin-bottom: 0.25rem;

  font-size: 0.75rem;
  font-weight: 700;
`;

export const ExampleCode = styled.div`
  font-family: ${monospaceFontFamily};
`;
