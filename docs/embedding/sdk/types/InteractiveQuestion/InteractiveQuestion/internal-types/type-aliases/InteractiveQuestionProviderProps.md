```ts
type InteractiveQuestionProviderProps = PropsWithChildren<InteractiveQuestionConfig & Omit<LoadSdkQuestionParams, "questionId"> & {
  questionId: InteractiveQuestionId;
}>;
```
