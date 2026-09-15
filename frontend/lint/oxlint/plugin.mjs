import { jsRules, settingsForFile } from "./config.mjs";

export function wrap(
  namespace,
  plugin,
  transformSettings = (settings) => settings,
  transformContext = (context) => context,
) {
  // Oxlint reuses one context object per rule for every file it lints.
  const contexts = new WeakMap();
  return {
    meta: { name: namespace },
    rules: Object.fromEntries(
      jsRules[namespace].map((name) => {
        const rule = plugin.rules[name];
        if (!rule)
          throw new Error(`Missing JS lint rule: ${namespace}/${name}`);
        if (typeof rule.create !== "function") {
          throw new Error(`Wrapped rule requires create: ${namespace}/${name}`);
        }
        // Oxlint runs createOnce instead of create whenever the property is present.
        // The getters below read context.filename, which throws inside createOnce.
        const { createOnce: _createOnce, ...legacyRule } = rule;
        return [
          name,
          {
            ...legacyRule,
            create(context) {
              let wrapped = contexts.get(context);
              if (!wrapped) {
                wrapped = transformContext(
                  Object.create(context, {
                    settings: {
                      get: () =>
                        transformSettings(
                          settingsForFile(context.filename).settings,
                        ),
                    },
                    parserOptions: {
                      get: () =>
                        settingsForFile(context.filename).parserOptions,
                    },
                  }),
                );
                contexts.set(context, wrapped);
              }
              return rule.create(wrapped);
            },
          },
        ];
      }),
    ),
  };
}
