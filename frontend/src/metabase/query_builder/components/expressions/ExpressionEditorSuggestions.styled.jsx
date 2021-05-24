import styled from "styled-components";

export const UlStyled = styled.ul.attrs({ className: "pb1" })`
  min-width: 150px;
  overflow-y: auto;
`;

const sectionTitleClassName =
  "mx2 h6 text-uppercase text-bold text-medium py1 pt2";
export const SectionTitle = styled.li.attrs({
  className: sectionTitleClassName,
})``;
