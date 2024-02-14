import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

const SaveStatusBase = styled.div`
  line-height: 1;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
`;

export const SaveStatusLoading = styled(SaveStatusBase)`
  color: ${color("text-medium")};
`;

export const SaveStatusSuccess = styled(SaveStatusBase)`
  color: white;
  background: ${color("success")};
`;

export const SaveStatusError = styled(SaveStatusBase)`
  color: white;
  background: ${color("error")};
`;
