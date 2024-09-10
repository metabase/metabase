import styled from "@emotion/styled";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
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

export const FormBox = styled(Box, doNotForwardProps("isInSidebar"))<
  BoxProps & {
    isInSidebar?: boolean;
  }
>`
  overflow: auto;
  flex-grow: 1;
  padding-bottom: 2.5rem;
  ${({ isInSidebar }) => (isInSidebar ? "" : "padding-inline: 2.5rem;")}
`;

export const StyledFormButtonsGroup = styled(
  Group,
  doNotForwardProps("isInSidebar"),
)<{ isInSidebar?: boolean }>`
  gap: 1rem;
  ${({ isInSidebar }) =>
    isInSidebar
      ? `
  padding-top: 1rem;
  justify-content: flex-end;
  `
      : `
  background-color: var(--mb-color-bg-white);
  border-top: 1px solid var(--mb-color-border);
  padding-block: 1rem;
  padding-inline: 2.5rem;
  `}
`;
