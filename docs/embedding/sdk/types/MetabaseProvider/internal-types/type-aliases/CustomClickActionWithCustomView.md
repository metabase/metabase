```ts
type CustomClickActionWithCustomView = CustomClickActionBase & {
  view: (parameters: CustomClickActionContext) => React.JSX.Element;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `view` | (`parameters`: [`CustomClickActionContext`](CustomClickActionContext.md)) => `React.JSX.Element` |
