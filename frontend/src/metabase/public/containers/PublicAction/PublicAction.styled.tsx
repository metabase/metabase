import styled from "@emotion/styled";
import { css } from "@emotion/react";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import BaseLoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";

export const LoadingAndErrorWrapper = styled(BaseLoadingAndErrorWrapper)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
`;

export const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 430px;

  ${FormSubmitButton.Button} {
    width: 100%;
  }
`;

const titleStyle = css`
  font-weight: 700;
  font-size: 1.125rem;
  line-height: 1.375rem;
  color: ${color("text-dark")};
`;

export const FormTitle = styled.h1`
  ${titleStyle}
  margin-bottom: 21px;
`;

export const FormResultMessage = styled.h1`
  ${titleStyle}
  text-align: center;
`;
