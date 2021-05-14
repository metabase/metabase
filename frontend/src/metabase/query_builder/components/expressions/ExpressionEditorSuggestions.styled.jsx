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

const liStyledClassName =
  "px2 cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit";
export const LiStyled = styled.li.attrs({ className: liStyledClassName })`
  padding-top: 5px;
  padding-bottom: 5px;
`;

const liStyledHighlightedClassName = "text-white bg-brand";
export const LiStyledHighlighted = styled(LiStyled).attrs({
  className: liStyledHighlightedClassName,
});
