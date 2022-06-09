import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { css } from "@emotion/react";

const sharedStyle = css`
  border: 1px solid ${alpha("white", 0)};

  border-radius: 4px;
  padding: 0.5rem;
  grid-area: 1 / 1 / 2 / 2;
  font-size: 14px;
  line-height: 20px;
  min-height: 0px;
`;

export const Root = styled.div`
  display: grid;
  max-width: 300px;

  &::after {
    content: attr(data-replicated-value) " ";
    white-space: pre-wrap;
    visibility: hidden;
    ${sharedStyle}
  }
`;

export const StyledTextArea = styled.textarea`
  resize: none;
  overflow: hidden;
  cursor: pointer;
  outline: none;
  &:hover,
  &:focus {
    border: 1px solid ${color("border")};
  }

  &:focus {
    cursor: text;
  }

  ${sharedStyle}
`;
