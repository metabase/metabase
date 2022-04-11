import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";

export const PremiumEmbeddingLicensePageContent = styled.div`
  display: flex;
  align-items: stretch;
  text-align: left;
  justify-content: center;
  flex-direction: column;
  margin-left: 10%;
  margin-top: 32px;
  max-width: 640px;
`;

export const PremiumEmbeddingHeading = styled.h1`
  font-weight: 700;
  font-size: 21px;
  line-height: 25px;
`;

export const PremiumEmbeddingDescription = styled.p`
  color: ${color("text-medium")};
  margin-bottom: 2rem;
  font-size: 14px;
  line-height: 24px;
`;

export const LicenseInputTitle = styled.div`
  font-weight: 700;
  margin-bottom: 1rem;
`;

export const Loader = styled(LoadingSpinner)`
  display: flex;
  justify-content: center;
`;
