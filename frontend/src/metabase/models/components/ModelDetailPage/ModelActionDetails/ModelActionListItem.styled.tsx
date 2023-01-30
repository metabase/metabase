import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ActionTitle = styled.h4`
  font-size: 1rem;
  font-weight: 700;
  color: ${color("text-dark")};
`;

export const ActionSubtitle = styled.span`
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 0.875rem;
  color: ${color("text-medium")};
  margin-top: 4px;
`;

export const Card = styled.div`
  display: block;
  position: relative;

  padding: 1rem;
  margin-top: 0.75rem;
  border-radius: 6px;

  color: ${color("text-white")};
  background-color: ${color("text-dark")};
`;

export const CodeBlock = styled.pre`
  font-family: Monaco, monospace;
  font-size: 0.7rem;
  white-space: pre-wrap;
  margin: 0;
`;

export const EditButton = styled(Button)`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;

  background-color: ${color("bg-white")};
  color: ${color("text-dark")};
`;

EditButton.defaultProps = {
  icon: "pencil",
  onlyIcon: true,
};

export const ImplicitActionCardContentRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

export const ImplicitActionMessage = styled.span`
  display: block;
  margin-top: 0.5rem;
`;
