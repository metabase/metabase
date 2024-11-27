import styled from "@emotion/styled";
import type { MantineSize } from "@mantine/styles";

type BadgeColor = "brand" | "gray";

const COLOR_VARIANTS = {
  brand: {
    color: "var(--mb-color-text-white)",
    background: "var(--mb-color-brand)",
  },
  gray: {
    color: "var(--mb-color-text-black)",
    /* eslint-disable no-restricted-syntax -- we should find a way to use semantic colors here */
    background: "var(--mb-base-color-gray-20)",
  },
};

// TODO: use Badge from metabase/ui when it's available
export const Badge = styled.span<{
  color: BadgeColor;
  uppercase?: boolean;
  px?: MantineSize;
  py?: MantineSize;
  fz?: MantineSize;
}>`
  padding: ${({ px, py, theme }) => {
    const paddingY = py ? theme.spacing[py] : "0";
    const paddingX = px ? theme.spacing[px] : "4px";
    return `${paddingY} ${paddingX}`;
  }};
  display: inline-block;
  line-height: 1rem;
  font-size: ${({ fz, theme }) => (fz ? theme.fontSizes[fz] : "0.625rem")};
  font-weight: 700;
  border-radius: 4px;
  text-transform: ${props =>
    (props.uppercase ?? true) ? "uppercase" : "none"};
  color: ${({ color }) => COLOR_VARIANTS[color].color};
  background: ${({ color }) => COLOR_VARIANTS[color].background};
`;
