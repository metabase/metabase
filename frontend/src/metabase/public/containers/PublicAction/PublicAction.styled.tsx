// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { FormSubmitButton } from "metabase/common/components/FormSubmitButton";
import { LoadingAndErrorWrapper as BaseLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const LoadingAndErrorWrapper = styled(BaseLoadingAndErrorWrapper)`
  display: flex;
  flex: 1 0 auto;
`;

export const ContentContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
`;

export const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 430px;

  ${FormSubmitButton.Button} {
    width: 100%;
  }

  ${breakpointMaxSmall} {
    width: 100%;
    padding: 0 0.5rem;
  }
`;

const titleStyle = css`
  font-weight: 700;
  font-size: 1.125rem;
  line-height: 1.375rem;
  color: var(--mb-color-text-primary);
`;

export const FormTitle = styled.h1`
  ${titleStyle}
  margin-bottom: 21px;
`;

export const FormResultMessage = styled.h1`
  ${titleStyle}
  text-align: center;
`;
