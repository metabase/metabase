import type {
  ExtendComponent,
  FactoryPayload,
  MantineThemeComponent,
} from "@mantine/core";

/**
 * Stands in for Mantine's `Component.extend`, which is the identity function
 * (`@mantine/core/esm/core/factory/factory.mjs`). An override reaches its
 * component through the string key it sits under in `theme.components`, which
 * `useProps` and the styles API look up by name, never through the component
 * value. Taking the payload as a type parameter keeps the same checking without
 * importing the component itself, so building a theme no longer pulls in every
 * component the theme happens to configure.
 */
export const themeComponent = <Payload extends FactoryPayload>(
  config: ExtendComponent<Payload>,
): MantineThemeComponent => config;
