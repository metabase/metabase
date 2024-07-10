import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const UploadInput = styled.input`
  display: none;
`;

export const LoadingStateContainer = styled.div`
  display: flex;
  transform: translateY(10px);
  align-items: center;
  height: 16px;
  color: ${color("brand")};
`;

export const InfoModalTitle = styled.h2`
  text-align: center;
  font-size: 1.375rem; /* 22px 🤦‍♀️ */
`;

export const InfoModalBody = styled.div`
  color: ${color("text-medium")};
`;

export const NewBadge = styled.div`
  padding: 5px 10px;
  font-size: 0.875rem;
  font-weight: 700;
  color: ${color("brand")};
  background-color: ${color("brand-lighter")};
  margin: 0 auto;
  border-radius: 6px;
`;

export const InfoModalContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  justify-content: center;
`;
