import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Button from "metabase/components/Button";

export const SectionRoot = styled.div`
  margin-bottom: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
`;

export const SectionTitle = styled.div`
  flex: 1 1 auto;
  margin-right: 1rem;
  color: ${color("brand")};
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.5rem;
`;

export const SectionButton = styled(Button)`
  flex: 0 0 auto;
  color: ${color("brand")};
  width: 2.5rem;
  height: 2.5rem;
`;

export const SectionBody = styled.div`
  padding: 1rem;
  border-top: 1px solid ${color("border")};
`;
