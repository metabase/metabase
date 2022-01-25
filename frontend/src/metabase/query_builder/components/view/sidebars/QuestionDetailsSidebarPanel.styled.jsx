import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const Container = styled.div`
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const SECTION_ROW_GAP = "1rem";

export const SidebarPaddedContent = styled.div`
  display: flex;
  flex-direction: column;
  row-gap: ${SECTION_ROW_GAP};
  padding: 0.5rem 1.5rem 1rem 1.5rem;
`;

export const BorderedSectionContainer = styled.div`
  display: flex;
  flex-direction: column;
  row-gap: ${SECTION_ROW_GAP};
  padding-top: ${SECTION_ROW_GAP};

  &:not(:empty) {
    border-top: 1px solid ${color("border")};
  }
`;

export const ModerationSectionContainer = styled.div`
  .Button {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
`;

export const LastEditInfoButton = styled.button`
  display: inline-block;
  box-sizing: border-box;
  text-decoration: none;
  background: transparent;
  border: none;
  color: ${color("text-medium")};
  cursor: pointer;
  font-family: "Lato", sans-serif;
  font-weight: 500;
  text-align: left;
  &:hover {
    color: ${color("brand")};
  }
`;

export const SectionTitle = styled.span`
  font-size: 12px;
  font-weight: 900;
  color: ${color("text-medium")};
`;
