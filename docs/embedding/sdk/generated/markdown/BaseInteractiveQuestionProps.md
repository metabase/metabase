```ts
type BaseInteractiveQuestionProps = InteractiveQuestionQuestionIdProps & {
  children: ReactNode;
  plugins: InteractiveQuestionProviderProps["componentPlugins"];
} & Pick<
    InteractiveQuestionProviderProps,
    | "onBeforeSave"
    | "onSave"
    | "entityTypeFilter"
    | "isSaveEnabled"
    | "initialSqlParameters"
    | "withDownloads"
    | "targetCollection"
  >;
```

## Type declaration

| Name        | Type                                                                                                       | Description                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `children?` | `ReactNode`                                                                                                | The children of the MetabaseProvider component.s |
| `plugins?`  | [`InteractiveQuestionProviderProps`](internal/InteractiveQuestionProviderProps.md)\[`"componentPlugins"`\] | -                                                |
