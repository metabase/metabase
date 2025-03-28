```ts
type CustomClickActionWithCustomView = CustomClickActionBase & {
  view: (parameters: CustomClickActionContext) => React_2.JSX.Element;
};
```

#### Type declaration

| Name   | Type                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| `view` | (`parameters`: [`CustomClickActionContext`](./generated/html/CustomClickActionContext.md)) => `React_2.JSX.Element` |
