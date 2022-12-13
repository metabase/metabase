import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SectionRoot = styled.div`
  padding: 1.5rem 1rem;
`;

export const SectionHeader = styled.div`
  font-size: 1rem;
  font-weight: bold;
`;

export const SectionMessage = styled.p`
  color: ${color("text-medium")};
`;

export const SectionMessageLink = styled.span`
  color: ${color("brand")};
  cursor: pointer;
`;

export const ParameterRoot = styled.div`
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
`;

export const ParameterBody = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
`;

export const ParameterName = styled.div`
  cursor: pointer;
  border-bottom: 1px dashed ${color("border")};
  font-weight: bold;
`;
