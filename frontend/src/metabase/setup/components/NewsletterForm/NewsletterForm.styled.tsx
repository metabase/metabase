import styled from "@emotion/styled";

import FormInput from "metabase/core/components/FormInput";
import { Form } from "metabase/forms";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EmailFormRoot = styled.div`
  position: relative;
  padding: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const EmailFormLabel = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  transform: translateY(-50%);
`;

export const EmailFormLabelCard = styled.div`
  display: flex;
  padding: 0 1.5rem;
  color: ${color("text-medium")};
  background-color: ${color("white")};
`;

export const EmailFormLabelIcon = styled(Icon)`
  width: 1rem;
  height: 1rem;
  margin-right: 0.5rem;
`;

export const EmailFormLabelText = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
`;

export const EmailFormHeader = styled.div`
  color: ${color("text-medium")};
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
`;

export const EmailForm = styled(Form)`
  display: flex;
`;

export const EmailFormInput = styled(FormInput)`
  flex: 1 0 auto;
  margin-right: 1rem;
  margin-bottom: 0;
`;

export const EmailFormSuccessContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;
`;

export const EmailFormSuccessIcon = styled(Icon)`
  color: ${color("success")};
  width: 1rem;
  height: 1rem;
  margin-right: 1rem;
`;

export const EmailFormSuccessText = styled.div`
  color: ${color("success")};
  font-size: 1rem;
  font-weight: bold;
`;
