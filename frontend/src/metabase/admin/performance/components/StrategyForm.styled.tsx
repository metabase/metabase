import styled from "@emotion/styled";

import { Form } from "metabase/forms";
import { color } from "metabase/lib/colors";
import type { BoxProps } from "metabase/ui";
import { Box, FixedSizeIcon, Group, Loader } from "metabase/ui";

export const LoaderInButton = styled(Loader)`
  position: relative;
  top: 1px;
`;

export const IconInButton = styled(FixedSizeIcon)`
  position: relative;
  top: 1px;
`;

export const FormWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const StyledForm = styled(Form)`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

export const FormBox = styled(Box)<
  BoxProps & {
    isInSidebar?: boolean;
  }
>`
  border-bottom: 1px solid var(--mb-color-border);
  overflow: auto;
  flex-grow: 1;
  padding-bottom: 2.5rem;
  ${({ isInSidebar }) =>
    isInSidebar
      ? `
  padding-inline-start: 2rem;
  padding-inline-end: 1rem;
  `
      : `
  padding-inline: 2.5rem;
`}
`;

export const StyledFormButtonsGroup = styled(Group)<{ isInSidebar?: boolean }>`
  padding-block: 1rem;
  gap: 1rem;
  background-color: ${color("bg-white")};
  border-top: 1px solid ${color("border")};
  ${({ isInSidebar }) =>
    isInSidebar
      ? `
  justify-content: flex-end;
  padding-inline-start: 2rem;
  padding-inline-end: 1rem;
  `
      : `
  padding-inline: 2.5rem;
  `}
`;
