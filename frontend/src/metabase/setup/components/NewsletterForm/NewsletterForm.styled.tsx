import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";

export const FormRoot = styled.div`
  position: relative;
  padding: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const FormLabel = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  transform: translateY(-50%);
`;

export const FormLabelCard = styled.div`
  display: flex;
  padding: 0 1.5rem;
  color: ${color("text-medium")};
  background-color: ${color("white")};
`;

export const FormLabelIcon = styled(Icon)`
  width: 1rem;
  height: 1rem;
  margin-right: 0.5rem;
`;

export const FormLabelText = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
`;

export const FormHeader = styled.div`
  color: ${color("text-medium")};
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
`;

export const FormContainer = styled.div`
  display: flex;
`;

export const FormFieldContainer = styled.div`
  flex: 1 0 auto;
  margin-right: 1rem;
  margin-bottom: -1.5em;
`;

export const FormSuccessContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;
`;

export const FormSuccessIcon = styled(Icon)`
  color: ${color("success")};
  width: 1rem;
  height: 1rem;
  margin-right: 1rem;
`;

export const FormSuccessText = styled.div`
  color: ${color("success")};
  font-size: 1rem;
  font-weight: bold;
`;
