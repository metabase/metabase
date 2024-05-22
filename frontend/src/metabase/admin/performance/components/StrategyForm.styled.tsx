import styled from "@emotion/styled";

import { Form } from "metabase/forms";
import { color } from "metabase/lib/colors";
import type { BoxProps } from "metabase/ui";
import { Box, FixedSizeIcon, Loader } from "metabase/ui";

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

export const FormBox = styled(Box)<BoxProps>`
  border-bottom: 1px solid ${() => color("border")};
  overflow: auto;
  flex-grow: 1;
`;
