```ts
type CustomClickAction = ClickActionBase & CustomClickActionBase & {
  onClick: (parameters: CustomClickActionContext) => void;
};
```

#### Type declaration

| Name       | Type                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `onClick?` | (`parameters`: [`CustomClickActionContext`](./generated/html/CustomClickActionContext.md)) => `void` |
