import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const FormRoot = styled.form`
  position: relative;
  padding: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const FormLabel = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
`;

export const FormLabelCard = styled.div`
  display: flex;
  padding: 0 1.5rem;
  color: ${color("text-medium")};
  background-color: ${color("white")};
`;

export const FormLabelIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const FormLabelText = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
`;

export const FormMessage = styled.div`
  color: ${color("text-medium")};
  font-size: 1rem;
  margin-bottom: 1.5rem;
`;
