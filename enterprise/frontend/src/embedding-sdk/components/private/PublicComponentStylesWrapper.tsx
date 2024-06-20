import styled from "@emotion/styled";
import type { ReactNode } from "react";

import { color } from "metabase/lib/colors";
import { useThemeSpecificCssVariables } from "metabase/styled-components/theme/theme";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
export function PublicComponentStylesWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const themeSpecificCssVariables = useThemeSpecificCssVariables();

  return (
    <StylesWrapperInner themeSpecificCssVariables={themeSpecificCssVariables}>
      {children}
    </StylesWrapperInner>
  );
}

const StylesWrapperInner = styled.div<{
  themeSpecificCssVariables: string;
}>`
  /* NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
   * NOTE: KEEP SYNCHRONIZED WITH:
   * frontend/src/metabase/ui/utils/colors.ts
   * frontend/src/metabase/styled-components/containers/GlobalStyles/GlobalStyles.tsx
   * frontend/src/metabase/css/core/colors.module.css
   * .storybook/preview-head.html
   */
  --mb-default-font-family: "${({ theme }) => theme.fontFamily}";
  --mb-color-bg-light: ${({ theme }) => theme.fn.themeColor("bg-light")};
  --mb-color-bg-dark: ${({ theme }) => theme.fn.themeColor("bg-dark")};
  --mb-color-brand: ${({ theme }) => theme.fn.themeColor("brand")};

  --mb-color-brand-light: color-mix(in srgb, var(--mb-color-brand) 53%, #fff);
  --mb-color-brand-lighter: color-mix(in srgb, var(--mb-color-brand) 60%, #fff);
  --mb-color-brand-alpha-04: color-mix(
    in srgb,
    var(--mb-color-brand) 4%,
    transparent
  );
  --mb-color-brand-alpha-88: color-mix(
    in srgb,
    var(--mb-color-brand) 88%,
    transparent
  );

  --mb-color-focus: ${({ theme }) => theme.fn.themeColor("focus")};
  --mb-color-bg-white: ${({ theme }) => theme.fn.themeColor("bg-white")};
  --mb-color-bg-black: ${({ theme }) => theme.fn.themeColor("bg-black")};
  --mb-color-shadow: ${({ theme }) => theme.fn.themeColor("shadow")};
  --mb-color-border: ${({ theme }) => theme.fn.themeColor("border")};
  --mb-color-text-dark: ${({ theme }) => theme.fn.themeColor("text-dark")};
  --mb-color-text-medium: ${({ theme }) => theme.fn.themeColor("text-medium")};
  --mb-color-text-light: ${({ theme }) => theme.fn.themeColor("text-light")};
  --mb-color-danger: ${({ theme }) => theme.fn.themeColor("danger")};
  --mb-color-error: ${({ theme }) => theme.fn.themeColor("error")};
  --mb-color-filter: ${({ theme }) => theme.fn.themeColor("filter")};
  --mb-color-bg-error: ${() => color("bg-error")};
  --mb-color-bg-medium: ${({ theme }) => theme.fn.themeColor("bg-medium")};
  --mb-color-bg-night: ${() => color("bg-night")};
  --mb-color-text-white: ${({ theme }) => theme.fn.themeColor("text-white")};
  --mb-color-success: ${({ theme }) => theme.fn.themeColor("success")};
  --mb-color-summarize: ${({ theme }) => theme.fn.themeColor("summarize")};
  --mb-color-warning: ${({ theme }) => theme.fn.themeColor("warning")};

  /**
    Theming-specific CSS variables.
    Keep in sync with [GlobalStyles.tsx] and [.storybook/preview-head.html].

    Refer to DEFAULT_METABASE_COMPONENT_THEME for their defaults.

    These CSS variables are not part of the core design system colors.
    Do NOT add them to [palette.ts] and [colors.ts].
  */
  ${({ themeSpecificCssVariables }) => themeSpecificCssVariables}

  :where(svg) {
    display: inline;
  }
`;
