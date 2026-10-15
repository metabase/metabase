```ts
type SdkQuestionId = number | "new" | "new-native" | SdkEntityId;
```

Represents the identifier for a question in the Metabase SDK.

## Example

<!-- [<snippet example>] -->

```typescript
// Numerical ID from question URL
const questionId: SdkQuestionId = 123;

// Entity ID string
const questionId: SdkQuestionId = "abc123def456";

// Create new notebook-style question
const questionId: SdkQuestionId = "new";

// Create new native SQL question
const questionId: SdkQuestionId = "new-native";
```

<!-- [<endsnippet example>] -->
