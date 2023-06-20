import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

interface AdminListItemProps {
  selected?: boolean;
  disabled?: boolean;
}

export const AdminListItem = styled.a<AdminListItemProps>`
  padding: 0.75em 1em 0.75em 1em;
  border: var(--border-size) var(--border-style) transparent;
  border-radius: var(--default-border-radius);
  margin-bottom: 0.25em;
  display: flex;
  align-items: center;
  text-decoration: none;
  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;
  justify-content: space-between;
  color: ${({ selected }) =>
    selected ? color("brand") : color("text-medium")};

  ${({ selected }) =>
    selected &&
    css`
      background-color: white;
      border-color: ${color("border")};
      margin-left: -0.5em;
      margin-right: -0.5em;
      padding-left: 1.5em;
      padding-right: 1.5em;
      box-shadow: 0 1px 2px var(--color-shadow);
    `};

  &:hover {
    background-color: white;
    border-color: ${color("border")};
    margin-left: -0.5em;
    margin-right: -0.5em;
    padding-left: 1.5em;
    padding-right: 1.5em;
    box-shadow: 0 1px 2px ${color("shadow")};
  }

  ${({ disabled }) =>
    disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `};
`;
