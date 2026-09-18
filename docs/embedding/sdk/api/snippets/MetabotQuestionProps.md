**`Expand`**

Props for the MetabotQuestion component.

## Extends

<!-- [<snippet extends>] -->

- `CommonStylingProps`

<!-- [<endsnippet extends>] -->

## Properties

<!-- [<snippet properties>] -->

| Property                                          | Type                                                                                                                                             | Description                                                                                                                                                                                                                                                                                                                                                      |
| :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="classname"></a> `className?`               | `string`                                                                                                                                         | A custom class name to be added to the root element.                                                                                                                                                                                                                                                                                                             |
| <a id="height"></a> `height?`                     | `Height`\<`string` \| `number`\>                                                                                                                 | A number or string specifying a CSS size value that specifies the height of the component                                                                                                                                                                                                                                                                        |
| <a id="issaveenabled"></a> `isSaveEnabled?`       | `boolean`                                                                                                                                        | Whether to show the save button.                                                                                                                                                                                                                                                                                                                                 |
| <a id="layout"></a> `layout?`                     | `"auto"` \| `"sidebar"` \| `"stacked"`                                                                                                           | Layout for the MetabotQuestion component. - `auto` (default): Metabot uses the `stacked` layout on mobile screens, and a `sidebar` layout on larger screens. - `stacked`: the question visualization stacks on top of the chat interface. - `sidebar`: the question visualization appears to the left of the chat interface, which is on a sidebar on the right. |
| <a id="style"></a> `style?`                       | [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579) | A custom style object to be added to the root element.                                                                                                                                                                                                                                                                                                           |
| <a id="targetcollection"></a> `targetCollection?` | [`SdkCollectionId`](./api/SdkCollectionId.md)                                                                                                    | The collection to save the question to. This will hide the collection picker from the save modal.                                                                                                                                                                                                                                                                |
| <a id="width"></a> `width?`                       | `Width`\<`string` \| `number`\>                                                                                                                  | A number or string specifying a CSS size value that specifies the width of the component                                                                                                                                                                                                                                                                         |

<!-- [<endsnippet properties>] -->
