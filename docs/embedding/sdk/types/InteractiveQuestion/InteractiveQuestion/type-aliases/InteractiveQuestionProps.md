```ts
type InteractiveQuestionProps = PropsWithChildren<{
  plugins: InteractiveQuestionProviderProps["componentPlugins"];
  questionId: InteractiveQuestionProviderProps["questionId"];
 }> & Pick<SaveQuestionProps<SDKCollectionReference>, "targetCollection"> & Pick<InteractiveQuestionProviderProps, 
  | "questionId"
  | "onBeforeSave"
  | "onSave"
  | "entityTypeFilter"
  | "isSaveEnabled"
  | "initialSqlParameters"
| "withDownloads">;
```
