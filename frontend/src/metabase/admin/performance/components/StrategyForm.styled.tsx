import styled from "@emotion/styled";

import { Form } from "metabase/forms";
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
  overflow: auto;
  flex-grow: 1;
  padding-bottom: 2.5rem;
  ${({ isInSidebar }) =>
    isInSidebar
      ? `
      padding-inline: 1rem;
      `
      : `
      padding-inline: 2.5rem;
  `}
`;

export const StyledFormButtonsGroup = styled(Group)<{ isInSidebar?: boolean }>`
  padding-block: 1rem;
  gap: 0.75rem;
  ${({ isInSidebar }) =>
    isInSidebar
      ? `
  justify-content: flex-end;
  padding-inline: 1rem;
  padding-bottom: 0;
  `
      : `
  background-color: var(--mb-color-bg-white);
  border-top: 1px solid var(--mb-color-border);
  padding-inline: 2.5rem;
  `}
`;
