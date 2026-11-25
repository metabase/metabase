import cx from "classnames";
import type React from "react";
import { forwardRef } from "react";

import { useComputedColorScheme, useMantineTheme } from "metabase/ui";

import S from "./PublicComponentStylesWrapper.style.css";

/**
 * Injects CSS variables and styles to the SDK components underneath them.
 * This is to ensure that the SDK components are styled correctly,
 * even when rendered under a React portal.
 */
export const PublicComponentStylesWrapper = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(function PublicComponentStylesWrapper(props, ref) {
  // Mantine scopes its CSS variables to `cssVariablesSelector=".mb-wrapper"`,
  // so the variables for the active color scheme only apply when the wrapper
  // itself carries `data-mantine-color-scheme`. Read the resolved scheme from
  // the parent MantineProvider so portals (e.g. the filter-changed toast in
  // guest embeds with `theme.preset: "dark"`) inherit it instead of being
  // pinned to light (EMB-1560).
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const theme = useMantineTheme();
  // The wrapper class reads the font size, so host rules and the `style` prop can still override it
  const style: React.CSSProperties & {
    "--public-component-font-size"?: string;
  } = {
    "--public-component-font-size": theme.other.fontSize,
    ...props.style,
  };

  return (
    <div
      {...props}
      ref={ref}
      dir="ltr"
      className={cx("mb-wrapper", S.publicComponentWrapper, props.className)}
      style={style}
      data-mantine-color-scheme={colorScheme}
    />
  );
});

/**
 * We can't apply a global css reset as it would leak into the host app but we
 * can't also apply our entire css reset scoped to this container, as it would
 * be of higher specificity than some of our styles.
 *
 * This works because `:where()` adds no specificity, so every rule here is (0,0,0).
 * Any of our rules with a class or element selector overrides it, whatever the load order.
 */
// note: if we move this to  css.module, remember to add :global to .mb-wrapper
export const SCOPED_CSS_RESET = `
  :where(.mb-wrapper) *:where(button) {
    border: 0;
    background-color: transparent;
  }

  /* The app resets list padding and margin globally. These styles are scoped
     to the wrapper, so the reset has to be repeated inside it. */
  :where(.mb-wrapper) *:where(ul) {
    padding: 0;
    margin: 0;
  }

  :where(.mb-wrapper) *:where(svg) {
    display: inline;
  }

  /* Mobile Safari sets the opacity of disabled inputs/textareas to 0.4 which we don't want
     https://github.com/metabase/metabase/issues/49170 */
  @supports (-webkit-touch-callout: none) {
    :where(.mb-wrapper) *:where(input),
    :where(.mb-wrapper) *:where(textarea) {
      opacity: 1;
    }
  }
`;
