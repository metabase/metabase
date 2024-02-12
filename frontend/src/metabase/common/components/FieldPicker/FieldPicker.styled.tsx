import styled from "@emotion/styled";
import { color, alpha, darken } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import { FieldInfoIcon } from "metabase/components/MetadataInfo/FieldInfoIcon";

export const ItemTitle = styled.div`
  min-width: 10ch;
`;

export const ItemIcon = styled(Icon)`
  margin: 0 0.5em;
  margin-left: 0.75em;
  color: ${color("text-dark")};
`;

export const ColumnItem = styled.li`
  &:first-child {
    margin-top: 0.5em;
  }

  &:last-child {
    margin-bottom: 0.5em;
  }

  label {
    display: flex;
    align-items: center;
    margin: 0 0.5em;
    padding: 0.5em;
    padding-right: 3em;
    border-radius: 6px;
    cursor: pointer;

    &:hover {
      background: ${color("bg-medium")};
    }
  }

  ${FieldInfoIcon.HoverTarget} {
    color: ${alpha(darken(color("brand"), 0.6), 0.8)};
    position: absolute;
    right: 0.5em;
  }

  &:hover {
    ${FieldInfoIcon.HoverTarget} {
      opacity: 1;
    }
  }
`;

export const ToggleItem = styled(ColumnItem)`
  border-bottom: 1px solid ${color("border")};
  padding-bottom: 0.5em;
  margin-bottom: 0.5em;

  ${ItemTitle} {
    margin-left: 1em;
  }
`;
