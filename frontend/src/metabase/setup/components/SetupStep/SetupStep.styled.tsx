import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StepRoot = styled.section`
  position: relative;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  padding: 4rem;
  margin-bottom: 1.75rem;
  background-color: ${color("white")};
`;

export const StepTitle = styled.div`
  color: ${color("brand")};
  font-size: 1.3125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

export const StepLabel = styled.div`
  position: absolute;
  top: 3.5rem;
  left: -1.3125rem;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 2.625rem;
  height: 2.625rem;
  border: 1px solid ${color("border")};
  border-radius: 50%;
  background-color: ${color("white")};
  color: ${color("brand")};
  font-weight: 700;
  line-height: 1;
`;

export const StepDescription = styled.div`
  color: ${color("text-dark")};
  margin: 0.875rem 0;
`;
