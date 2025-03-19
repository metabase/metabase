```ts
type SaveQuestionProps<C> = {
  closeOnSuccess: boolean;
  initialCollectionId:   | CollectionId
     | null;
  initialDashboardTabId: number | null;
  multiStep: boolean;
  onCreate: (question: Question, options?: {
     dashboardTabId: DashboardTabId;
    }) => Promise<Question>;
  onSave: (question: Question) => Promise<void>;
  originalQuestion:   | Question
     | null;
  question: Question;
  targetCollection: C;
};
```

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `C` | [`CollectionId`](../../../../MetabaseProvider/internal-types/type-aliases/CollectionId.md) |

## Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="closeonsuccess"></a> `closeOnSuccess`? | `boolean` | - |
| <a id="initialcollectionid"></a> `initialCollectionId`? | \| [`CollectionId`](../../../../MetabaseProvider/internal-types/type-aliases/CollectionId.md) \| `null` | - |
| <a id="initialdashboardtabid"></a> `initialDashboardTabId`? | `number` \| `null` | - |
| <a id="multistep"></a> `multiStep`? | `boolean` | - |
| <a id="oncreate"></a> `onCreate` | (`question`: [`Question`](../../../../MetabaseProvider/internal-types/classes/Question.md), `options`?: \{ `dashboardTabId`: [`DashboardTabId`](../../../../MetabaseProvider/internal-types/type-aliases/DashboardTabId.md); \}) => `Promise`\<[`Question`](../../../../MetabaseProvider/internal-types/classes/Question.md)\> | - |
| <a id="onsave"></a> `onSave` | (`question`: [`Question`](../../../../MetabaseProvider/internal-types/classes/Question.md)) => `Promise`\<`void`\> | - |
| <a id="originalquestion"></a> `originalQuestion` | \| [`Question`](../../../../MetabaseProvider/internal-types/classes/Question.md) \| `null` | - |
| <a id="question-2"></a> `question` | [`Question`](../../../../MetabaseProvider/internal-types/classes/Question.md) | - |
| <a id="targetcollection"></a> `targetCollection`? | `C` | The target collection to save the question to. Currently used for the embedding SDK. When this is defined, the collection picker will be hidden and the question will be saved to this collection. |
