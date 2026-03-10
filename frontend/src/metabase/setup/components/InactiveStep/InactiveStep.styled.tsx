// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

interface Props {
  isCompleted?: boolean;
}

export const StepRoot = styled.section<Props>`
  position: relative;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  padding: 1rem 2rem;
  margin-bottom: 1.75rem;
  background-color: ${(props) =>
    color(props.isCompleted ? "background-primary" : "background-secondary")};
`;

export const StepTitle = styled.div<Props>`
  color: ${(props) => (props.isCompleted ? color("success") : color("brand"))};
  font-size: 1rem;
  font-weight: 700;
  margin: 0.5rem 0;
`;

export const StepLabel = styled.div<Props>`
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
  width: 2.625rem;
  height: 2.625rem;
  border: 1px solid
    ${(props) => (props.isCompleted ? color("success") : color("border"))};
  border-radius: 50%;
  background-color: ${(props) =>
    props.isCompleted ? color("success") : color("background-primary")};
`;

export const StepLabelText = styled.span`
  color: var(--mb-color-brand);
  font-weight: 700;
  line-height: 1;
`;

export const StepLabelIcon = styled(Icon)`
  width: 1rem;
  height: 1rem;
  color: var(--mb-color-text-primary-inverse);
`;
