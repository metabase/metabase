// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import type { FieldAlignment, FieldOrientation } from "./types";

interface FormCaptionProps {
  alignment: FieldAlignment;
  orientation: FieldOrientation;
  hasDescription: boolean;
}

export const FieldCaption = styled.div<FormCaptionProps>`
  align-self: ${(props) =>
    props.orientation !== "vertical" && !props.hasDescription ? "center" : ""};
  margin-left: ${(props) =>
    props.orientation === "horizontal" &&
    props.alignment === "start" &&
    "0.5rem"};
  margin-right: ${(props) =>
    props.orientation === "horizontal" &&
    props.alignment === "end" &&
    "0.5rem"};
`;

interface FieldLabelProps {
  hasError: boolean;
}

export const FieldLabel = styled.label<FieldLabelProps>`
  display: block;
  color: ${(props) =>
    props.hasError ? color("error") : color("text-secondary")};
  font-size: 0.77rem;
  font-weight: 900;
`;

export const OptionalTag = styled.span`
  color: var(--mb-color-text-secondary);
  font-size: 0.77rem;
  font-weight: 900;
  margin-left: 0.25rem;
`;

interface FieldLabelContainerProps {
  orientation: FieldOrientation;
  hasDescription: boolean;
}

export const FieldLabelContainer = styled.div<FieldLabelContainerProps>`
  display: flex;
  align-items: center;
  margin-bottom: ${(props) =>
    props.orientation === "vertical" || props.hasDescription ? "0.5em" : ""};
`;

export const FieldLabelError = styled.span`
  color: var(--mb-color-error);
`;

export const FieldDescription = styled.div`
  color: var(--mb-color-text-secondary);
  margin-bottom: 0.5rem;
`;

export const FieldInfoIcon = styled(Icon)`
  color: var(--mb-color-background-tertiary-inverse);
  margin-left: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const FieldInfoLabel = styled.div`
  color: var(--mb-color-text-secondary);
  font-size: 0.75rem;
  margin-left: auto;
  cursor: default;
`;

interface FieldRootProps {
  alignment: FieldAlignment;
  orientation: FieldOrientation;
}

export const FieldRoot = styled.div<FieldRootProps>`
  display: ${(props) => props.orientation === "horizontal" && "flex"};
  justify-content: ${(props) =>
    props.alignment === "end" &&
    props.orientation === "horizontal" &&
    "space-between"};
  margin-bottom: 1.25rem;

  &:focus-within {
    ${FieldLabel} {
      color: var(--mb-color-text-secondary);
    }

    ${FieldLabelError} {
      display: none;
    }
  }
`;

export const FieldTitleActions = styled.div`
  margin-left: auto;
  font-size: 0.77rem;
  font-weight: 900;
  color: var(--mb-color-text-secondary);
`;
