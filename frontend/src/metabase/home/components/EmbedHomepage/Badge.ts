import styled from "@emotion/styled";

type BadgeColor = "brand" | "gray";

const COLOR_VARIANTS = {
  brand: {
    color: "var(--mb-color-text-white)",
    background: "var(--mb-color-brand)",
  },
  gray: {
    color: "var(--mb-color-text-black)",
    background: "var(--mb-base-color-gray-20)",
  },
};

// TODO: use Badge from metabase/ui when it's available
export const Badge = styled.span<{ color: BadgeColor; uppercase?: boolean }>`
  padding: 0px 4px;
  display: inline-block;
  line-height: 1rem;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 4px;
  text-transform: ${props =>
    (props.uppercase ?? true) ? "uppercase" : "none"};
  color: ${props => COLOR_VARIANTS[props.color].color};
  background: ${props => COLOR_VARIANTS[props.color].background};
`;
