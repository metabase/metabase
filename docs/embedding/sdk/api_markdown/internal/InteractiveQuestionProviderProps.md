```ts
type InteractiveQuestionProviderProps = PropsWithChildren<InteractiveQuestionConfig & Omit<LoadSdkQuestionParams, "questionId"> & {
  questionId: SdkQuestionId | null;
  variant: "static" | "interactive";
}>;
```
