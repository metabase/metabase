import { jsRules, settingsForFile } from "./config.mjs";

export function wrap(
  namespace,
  plugin,
  transformSettings = (settings) => settings,
  transformContext = (context) => context,
) {
  return {
    meta: { name: namespace },
    rules: Object.fromEntries(
      jsRules[namespace].map((name) => {
        const rule = plugin.rules[name];
        if (!rule)
          throw new Error(`Missing JS lint rule: ${namespace}/${name}`);
        return [
          name,
          {
            ...rule,
            create(context) {
              const { settings, parserOptions } = settingsForFile(
                context.filename,
              );
              return rule.create(
                transformContext(
                  Object.create(context, {
                    settings: { value: transformSettings(settings) },
                    parserOptions: { value: parserOptions },
                  }),
                ),
              );
            },
          },
        ];
      }),
    ),
  };
}
