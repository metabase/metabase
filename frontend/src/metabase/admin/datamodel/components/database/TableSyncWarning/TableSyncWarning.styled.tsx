import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SyncWarningRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 2rem;
`;

export const SyncWarningTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: bold;
  line-height: 1.5rem;
  margin-bottom: 0.5rem;
`;

export const SyncWarningDescription = styled.div`
  color: ${color("text-dark")};
  line-height: 1.5rem;
  margin-bottom: 1.5rem;
  max-width: 25rem;
  text-align: center;
`;
