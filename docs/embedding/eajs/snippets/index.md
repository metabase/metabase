TypeDoc-friendly interfaces for EAJS web component documentation.

These are flattened, kebab-case representations of the web component HTML
attributes, designed for TypeDoc to generate clean props tables. They mirror
the actual `observedAttributes` from `embed.ts` and the types from
`embed.ts` types, but are simplified for documentation purposes.

DO NOT import these interfaces in application code. They exist solely for
documentation generation via `yarn embedding-eajs:docs:generate`.

## Interfaces

| Interface                                                     | Description                                              |
| :------------------------------------------------------------ | :------------------------------------------------------- |
| [MetabaseBrowserAttributes](MetabaseBrowserAttributes.md)     | Attributes for the `<metabase-browser>` web component.   |
| [MetabaseDashboardAttributes](MetabaseDashboardAttributes.md) | Attributes for the `<metabase-dashboard>` web component. |
| [MetabaseMetabotAttributes](MetabaseMetabotAttributes.md)     | Attributes for the `<metabase-metabot>` web component.   |
| [MetabaseQuestionAttributes](MetabaseQuestionAttributes.md)   | Attributes for the `<metabase-question>` web component.  |
