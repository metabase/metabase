import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const SavedQuestionPickerRoot = styled.div`
  display: flex;
  width: 620px;
  overflow: hidden;
  border-top: 1px solid ${color("border")};
`;

export const CollectionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 310px;
  background-color: ${color("bg-light")};
  overflow: auto;
`;

export const BackButton = styled.a`
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  color: ${color("text-dark")};
  border-bottom: 1px solid ${color("border")};
  padding: 1rem;

  &:hover {
    color: ${color("brand")};
  }
`;
