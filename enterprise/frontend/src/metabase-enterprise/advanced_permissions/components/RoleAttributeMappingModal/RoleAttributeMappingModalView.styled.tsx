import styled from "@emotion/styled";
import Alert from "metabase/core/components/Alert";

export const RoleAttributeMappingModalViewRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 2rem;
`;

export const RoleAttributeMappingDescription = styled.p`
  line-height: 1.4rem;
`;

export const RoleAttributeMappingAlert = styled(Alert)`
  margin-bottom: 1rem;
`;
