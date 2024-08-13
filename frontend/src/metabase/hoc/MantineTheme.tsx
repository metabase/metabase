import { useMantineTheme, type MantineTheme } from "metabase/ui";

interface WithMantineThemeProps {
  theme: MantineTheme;
}

/**
 * Inject mantine theme context into legacy class components.
 * Do not use this in new code, as HoCs are deprecated.
 */
export function withMantineTheme<
  T extends WithMantineThemeProps = WithMantineThemeProps,
>(
  ComposedComponent: React.ComponentType<T>,
): React.FC<Omit<T, keyof WithMantineThemeProps>> {
  return function MantineThemeWrapper(props) {
    const theme = useMantineTheme();

    return <ComposedComponent {...(props as T)} theme={theme} />;
  };
}
