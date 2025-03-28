```ts
type DashCardMenuItem = {
  disabled: boolean;
  iconName: IconName;
  label: string;
  onClick: () => void;
 } & MenuItemProps;
```

#### Type declaration

| Name        | Type                                       |
| ----------- | ------------------------------------------ |
| `disabled?` | `boolean`                                  |
| `iconName`  | [`IconName`](./generated/html/IconName.md) |
| `label`     | `string`                                   |
| `onClick`   | () => `void`                               |
