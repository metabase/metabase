import type { ComponentType } from "react";

import {
  getComputedSettings,
  getSettingsWidgets,
  updateSettings as updateVizSettings,
} from "metabase/viz-core";

import type {
  SettingDefinitions,
  SettingKey,
  SettingWidget,
  StoredSettings,
} from "./types";

/*
 * Thin typed wrappers over viz-core's settings engine. They only adapt call
 * signatures: engine changes belong in viz-core, so the two can't drift apart.
 */

const isSettingKey = <TContext, S, TSection extends string>(
  definitions: SettingDefinitions<TContext, S, TSection>,
  key: string,
): key is SettingKey<S> => key in definitions;

/** viz-core's `isValid` reads the stored value from `settings`; ours takes it as an argument. */
const toEngineDefinitions = <TContext, S, TSection extends string>(
  definitions: SettingDefinitions<TContext, S, TSection>,
) =>
  Object.fromEntries(
    Object.keys(definitions)
      .filter((key) => isSettingKey(definitions, key))
      .map((key) => {
        const definition = definitions[key];
        return [
          key,
          {
            ...definition,
            isValid: (context: TContext, settings: Partial<S>) =>
              definition.isValid(settings[key], context, settings),
          },
        ];
      }),
  );

/** Computes every setting: stored values that pass `isValid`, defaults for the rest. */
export function computeSettings<TContext, S, TSection extends string>(
  definitions: SettingDefinitions<TContext, S, TSection>,
  context: TContext,
  stored: StoredSettings,
): S {
  const computed: unknown = getComputedSettings(
    toEngineDefinitions(definitions),
    context,
    stored,
  );
  // Every definition has a getDefault and an isValid, so the engine assigns
  // every key of S a value that is either validated or a default.
  return computed as S;
}

/** Widgets for every setting that has one, with dependencies applied on change. */
export function getSettingWidgets<TContext, S, TSection extends string>(
  definitions: SettingDefinitions<TContext, S, TSection>,
  context: TContext,
  stored: StoredSettings,
  computed: S,
  onChange: (changes: Partial<S>) => void,
): SettingWidget<TSection>[] {
  const computedSettings: Partial<S> = computed;
  const widgets = getSettingsWidgets(
    definitions,
    stored,
    computedSettings,
    context,
    (changes) => {
      // The engine only writes keys taken from our definitions.
      onChange(changes as Partial<S>);
    },
  );

  return widgets.flatMap((widget) => {
    const { id, widget: component } = widget;
    if (
      !isSettingKey(definitions, id) ||
      component === undefined ||
      typeof component === "string"
    ) {
      return [];
    }
    return [
      {
        id,
        section: definitions[id].getSection(),
        inline: definitions[id].inline,
        secondary: definitions[id].secondary,
        title: widget.title,
        hint: definitions[id].getHint?.(),
        TitleAction: definitions[id].TitleAction,
        hidden: widget.hidden,
        value: widget.value,
        props: widget.props,
        // Our definitions name registry widgets or pass React components, never
        // custom-viz mounts, so a resolved widget is always a component.
        widget: component as ComponentType<
          Record<string, unknown> & { id: string }
        >,
        onChange: (value: unknown) => widget.onChange?.(value),
      },
    ];
  });
}

/** Merges changes into stored settings. An `undefined` value removes the key. */
export function updateSettings<S>(
  stored: StoredSettings,
  changes: Partial<S>,
): StoredSettings {
  return updateVizSettings(stored, changes);
}
