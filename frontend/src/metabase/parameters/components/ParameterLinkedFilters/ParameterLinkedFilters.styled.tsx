import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SectionRoot = styled.div`
  padding: 1.5rem 1rem;
`;

export const SectionHeader = styled.div`
  font-size: 1rem;
  font-weight: bold;
`;

export const SectionMessage = styled.div`
  color: ${color("text-medium")};
`;

export const SectionMessageLink = styled.span`
  color: ${color("brand")};
  cursor: pointer;
`;
