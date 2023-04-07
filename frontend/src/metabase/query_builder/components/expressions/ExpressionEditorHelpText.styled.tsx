import styled from "@emotion/styled";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const Container = styled.div`
  padding: 1rem;

  font-size: 0.875rem;
`;

export const FunctionHelpCode = styled.div`
  padding: 0.5rem;

  background-color: ${color("bg-light")};

  color: ${color("text-dark")};
  font-family: ${monospaceFontFamily};
`;

export const FunctionHelpCodeArgument = styled.span`
  color: ${color("brand")};
`;

export const ExampleBlock = styled.div`
  margin-top: 1rem;
`;

export const BlockSubtitleText = styled.div`
  margin-bottom: 0.25rem;

  color: ${color("text-light")};
  font-size: 0.75rem;
  font-weight: 700;
`;

export const ExampleCode = styled.div`
  font-family: ${monospaceFontFamily};
`;

export const Divider = styled.div`
  width: 100%;
  height: 1px;
  background-color: ${color("border")};
  margin: 1rem -1rem 1rem;
`;
