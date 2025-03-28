```ts
type UiParameter = 
  | FieldFilterUiParameter
  | ValuePopulatedParameter & {
  hidden: boolean;
};
```

#### Type declaration

| Name      | Type      |
| --------- | --------- |
| `hidden?` | `boolean` |
