```ts
type InteractiveQuestionConfig = {
  componentPlugins: MetabasePluginsConfig;
  entityTypeFilter: EntityTypeFilterKeys[];
  initialSqlParameters: ParameterValues;
  isSaveEnabled: boolean;
  onBeforeSave: (question: 
     | MetabaseQuestion
     | undefined, context: {
     isNewQuestion: boolean;
    }) => Promise<void>;
  onNavigateBack: () => void;
  onSave: (question: 
     | MetabaseQuestion
     | undefined, context: {
     isNewQuestion: boolean;
    }) => void;
  withDownloads: boolean;
} & Pick<SaveQuestionProps<SDKCollectionReference>, "targetCollection">;
```

## Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `componentPlugins`? | [`MetabasePluginsConfig`](../../../../MetabaseProvider/internal-types/type-aliases/MetabasePluginsConfig.md) | - |
| `entityTypeFilter`? | [`EntityTypeFilterKeys`](EntityTypeFilterKeys.md)[] | - |
| `initialSqlParameters`? | [`ParameterValues`](ParameterValues.md) | Initial values for the SQL parameters |
| `isSaveEnabled`? | `boolean` | Is the save question button visible? |
| `onBeforeSave`? | (`question`: \| [`MetabaseQuestion`](../../../../MetabaseProvider/internal-types/interfaces/MetabaseQuestion.md) \| `undefined`, `context`: \{ `isNewQuestion`: `boolean`; \}) => `Promise`\<`void`\> | - |
| `onNavigateBack`? | () => `void` | - |
| `onSave`? | (`question`: \| [`MetabaseQuestion`](../../../../MetabaseProvider/internal-types/interfaces/MetabaseQuestion.md) \| `undefined`, `context`: \{ `isNewQuestion`: `boolean`; \}) => `void` | - |
| `withDownloads`? | `boolean` | - |
