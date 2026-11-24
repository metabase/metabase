```ts
type DashCardMenuItem = {
  children?: ReactNode;
  closeMenuOnClick?: boolean;
  color?: MantineColor;
  disabled?: boolean;
  iconName: IconName;
  label: string;
  leftSection?: ReactNode;
  onClick: () => void;
  rightSection?: ReactNode;
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                                           | Type                                                                                                      | Description                                                                                                                      |
| :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| <a id="dashcardmenuitem-children"></a> `children?`                 | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L436) | Item children                                                                                                                    |
| <a id="dashcardmenuitem-closemenuonclick"></a> `closeMenuOnClick?` | `boolean`                                                                                                 | Determines whether the menu should be closed when the item is clicked, overrides `closeOnItemClick` prop on the `Menu` component |
| <a id="dashcardmenuitem-color"></a> `color?`                       | [`MantineColor`](https://v7.mantine.dev/overview)                                                         | Key of `theme.colors` or any valid CSS color                                                                                     |
| <a id="dashcardmenuitem-disabled"></a> `disabled?`                 | `boolean`                                                                                                 | Disables item                                                                                                                    |
| <a id="dashcardmenuitem-iconname"></a> `iconName`                  | [`IconName`](/docs/latest/embedding/sdk/api/IconName.md)                                                  | Icon name                                                                                                                        |
| <a id="dashcardmenuitem-label"></a> `label`                        | `string`                                                                                                  | Item label                                                                                                                       |
| <a id="dashcardmenuitem-leftsection"></a> `leftSection?`           | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L436) | Section displayed on the left side of the label                                                                                  |
| <a id="dashcardmenuitem-onclick"></a> `onClick`                    | () => `void`                                                                                              | Click handler                                                                                                                    |
| <a id="dashcardmenuitem-rightsection"></a> `rightSection?`         | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L436) | Section displayed on the right side of the label                                                                                 |

<!-- [<endsnippet properties>] -->
