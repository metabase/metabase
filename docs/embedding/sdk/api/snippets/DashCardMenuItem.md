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

| Property                                          | Type                                                                                                                                        | Description                                                                                                                      |
| :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- |
| <a id="children"></a> `children?`                 | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478) | Item children                                                                                                                    |
| <a id="closemenuonclick"></a> `closeMenuOnClick?` | `boolean`                                                                                                                                   | Determines whether the menu should be closed when the item is clicked, overrides `closeOnItemClick` prop on the `Menu` component |
| <a id="color"></a> `color?`                       | [`MantineColor`](https://v7.mantine.dev/overview)                                                                                           | Key of `theme.colors` or any valid CSS color                                                                                     |
| <a id="disabled"></a> `disabled?`                 | `boolean`                                                                                                                                   | Disables item                                                                                                                    |
| <a id="iconname"></a> `iconName`                  | [`IconName`](./api/IconName.md)                                                                                                             | Icon name                                                                                                                        |
| <a id="label"></a> `label`                        | `string`                                                                                                                                    | Item label                                                                                                                       |
| <a id="leftsection"></a> `leftSection?`           | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478) | Section displayed on the left side of the label                                                                                  |
| <a id="onclick"></a> `onClick`                    | () => `void`                                                                                                                                | Click handler                                                                                                                    |
| <a id="rightsection"></a> `rightSection?`         | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478) | Section displayed on the right side of the label                                                                                 |

<!-- [<endsnippet properties>] -->
