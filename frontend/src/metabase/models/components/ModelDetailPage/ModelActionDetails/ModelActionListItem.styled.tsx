import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ActionTitle = styled.h4`
  font-size: 1rem;
  font-weight: 700;
  color: ${color("text-dark")};
`;

export const CodeBlock = styled.pre`
  display: block;
  padding: 1rem;
  margin-top: 0.5rem;
  border-radius: 6px;

  font-family: "Fira Code", monospace;
  font-size: 0.7rem;
  white-space: pre-wrap;
  color: ${color("text-white")};
  background-color: #12436e;
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

export const CodeContainer = styled.div`
  position: relative;
`;
