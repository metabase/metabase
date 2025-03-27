```ts
type PopoverClickAction = ClickActionBase & {
  popover: (props: ClickActionPopoverProps) => JSX.Element;
  popoverProps: Record<string, unknown>;
};
```

#### Type declaration

| Name            | Type                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `popover`       | (`props`: [`ClickActionPopoverProps`](./api_html/ClickActionPopoverProps.md)) => `JSX.Element` |
| `popoverProps?` | `Record`<`string`, `unknown`>                                                                  |
