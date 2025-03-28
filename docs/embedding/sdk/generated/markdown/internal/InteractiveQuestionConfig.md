```ts
type InteractiveQuestionConfig = {
  componentPlugins: MetabasePluginsConfig;
  entityTypeFilter: EntityTypeFilterKeys[];
  initialSqlParameters: ParameterValues_2;
  isSaveEnabled: boolean;
  onBeforeSave: (
    question: MetabaseQuestion | undefined,
    context: {
      isNewQuestion: boolean;
    },
  ) => Promise<void>;
  onNavigateBack: () => void;
  onSave: (
    question: MetabaseQuestion | undefined,
    context: {
      isNewQuestion: boolean;
    },
  ) => void;
  targetCollection: SdkCollectionId;
  withDownloads: boolean;
};
```

#### Properties

##### componentPlugins?

```ts
optional componentPlugins: MetabasePluginsConfig;
```

***

##### entityTypeFilter?

```ts
optional entityTypeFilter: EntityTypeFilterKeys[];
```

***

##### initialSqlParameters?

```ts
optional initialSqlParameters: ParameterValues_2;
```

Initial values for the SQL parameters

***

##### isSaveEnabled?

```ts
optional isSaveEnabled: boolean;
```

Is the save question button visible?

***

##### onBeforeSave()?

```ts
optional onBeforeSave: (question: MetabaseQuestion | undefined, context: {
  isNewQuestion: boolean;
}) => Promise<void>;
```

###### Parameters

| Parameter               | Type                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `question`              | [`MetabaseQuestion`](../MetabaseQuestion.md) \| `undefined` |
| `context`               | { `isNewQuestion`: `boolean`; }                             |
| `context.isNewQuestion` | `boolean`                                                   |

###### Returns

`Promise`<`void`>

***

##### onNavigateBack()?

```ts
optional onNavigateBack: () => void;
```

###### Returns

`void`

***

##### onSave()?

```ts
optional onSave: (question: MetabaseQuestion | undefined, context: {
  isNewQuestion: boolean;
 }) => void;
```

###### Parameters

| Parameter               | Type                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `question`              | [`MetabaseQuestion`](../MetabaseQuestion.md) \| `undefined` |
| `context`               | { `isNewQuestion`: `boolean`; }                             |
| `context.isNewQuestion` | `boolean`                                                   |

###### Returns

`void`

***

##### targetCollection?

```ts
optional targetCollection: SdkCollectionId;
```

***

##### withDownloads?

```ts
optional withDownloads: boolean;
```
