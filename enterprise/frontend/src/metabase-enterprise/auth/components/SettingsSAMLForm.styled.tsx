import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface SAMLFormSectionProps {
  isSSLSection?: boolean;
}

export const SAMLFormSection = styled.div<SAMLFormSectionProps>`
  padding: 1rem 2rem ${props => (props.isSSLSection ? "0.5rem" : "1rem")};
  margin-bottom: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;
