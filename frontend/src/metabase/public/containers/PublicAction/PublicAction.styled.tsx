import styled from "@emotion/styled";
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

export const FormTitle = styled.h1`
  font-weight: 700;
  font-size: 18px;
  line-height: 22px;
  color: ${color("text-dark")};

  margin-bottom: 21px;
`;
