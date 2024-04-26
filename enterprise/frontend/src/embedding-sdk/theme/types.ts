import type { CSSObject, MantineThemeOverride } from "@mantine/core";

// TODO! should be React.CSSProperties instead of CSSObject, as Mantine V7 no longer supports "sx" prop
// TODO? do we use a minimal, custom style object instead?
export type MetabaseTheme = MantineThemeOverride & {
  other: {
    labels?: CSSObject;

    smartScalar?: {
      value?: CSSObject;
      title?: CSSObject;
      description?: CSSObject;
    };
  };
};
