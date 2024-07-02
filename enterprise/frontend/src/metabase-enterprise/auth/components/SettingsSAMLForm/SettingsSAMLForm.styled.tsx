import styled from "@emotion/styled";

export interface SAMLFormSectionProps {
  isSSLSection?: boolean;
  wide?: boolean;
}

export const SAMLFormSection = styled.div<SAMLFormSectionProps>`
  padding: 1rem 2rem ${props => (props.isSSLSection ? "0.5rem" : "1rem")};
  margin-bottom: 1rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  // The section containing the GroupMappingsWidget needs to be wider
  width: ${props => (props.wide ? "780px" : "520px")};

  // Even in a wide section, the input is better if same width as elsewhere
  input {
    max-width: 460px;
  }
`;

export const SAMLFormCaption = styled.div`
  color: var(--mb-color-text-medium);
  margin-bottom: 2rem;
`;

export const SAMLFormFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 1rem;
  margin-bottom: 1rem;
`;
