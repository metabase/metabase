import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const SectionRoot = styled.div`
  border-top: 1px solid ${color("border")};
  padding-top: 1.5rem;
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
`;

export const SectionContainer = styled.div`
  flex: 1 1 auto;
  margin-right: 2rem;
`;

export const SectionTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: 700;
`;

export const SectionDescription = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.5rem;
`;
