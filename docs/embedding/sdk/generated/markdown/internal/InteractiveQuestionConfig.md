```ts
type InteractiveQuestionConfig = {
  componentPlugins: MetabasePluginsConfig;
  entityTypeFilter: EntityTypeFilterKeys[];
  initialSqlParameters: ParameterValues;
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

## Properties

### componentPlugins?

```ts
optional componentPlugins: MetabasePluginsConfig;
```

Additional mapper function to override or add drill-down menu

---

### entityTypeFilter?

```ts
optional entityTypeFilter: EntityTypeFilterKeys[];
```

An array that specifies which entity types are available in the data picker

---

### initialSqlParameters?

```ts
optional initialSqlParameters: ParameterValues;
```

Initial values for the SQL parameters.

---

### isSaveEnabled?

```ts
optional isSaveEnabled: boolean;
```

Whether to show the save button.

---

### onBeforeSave()?

```ts
optional onBeforeSave: (question: MetabaseQuestion | undefined, context: {
  isNewQuestion: boolean;
}) => Promise<void>;
```

A callback function that triggers before saving. Only relevant when `isSaveEnabled = true`

#### Parameters

| Parameter               | Type                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `question`              | [`MetabaseQuestion`](../MetabaseQuestion.md) \| `undefined` |
| `context`               | \{ `isNewQuestion`: `boolean`; \}                           |
| `context.isNewQuestion` | `boolean`                                                   |

#### Returns

`Promise`\<`void`\>

---

### onNavigateBack()?

```ts
optional onNavigateBack: () => void;
```

A callback function that triggers when a user clicks the back button.

#### Returns

`void`

---

### onSave()?

```ts
optional onSave: (question: MetabaseQuestion | undefined, context: {
  isNewQuestion: boolean;
 }) => void;
```

A callback function that triggers when a user saves the question. Only relevant when `isSaveEnabled = true`

#### Parameters

| Parameter               | Type                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `question`              | [`MetabaseQuestion`](../MetabaseQuestion.md) \| `undefined` |
| `context`               | \{ `isNewQuestion`: `boolean`; \}                           |
| `context.isNewQuestion` | `boolean`                                                   |

#### Returns

`void`

---

### targetCollection?

```ts
optional targetCollection: SdkCollectionId;
```

The collection to save the question to. This will hide the collection picker from the save modal. Only applicable to interactive questions.

---

### withDownloads?

```ts
optional withDownloads: boolean;
```

Enables the ability to download results in the interactive question.
