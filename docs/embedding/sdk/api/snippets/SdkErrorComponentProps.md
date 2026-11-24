```ts
type SdkErrorComponentProps = {
  error?: Error;
  message: ReactNode;
  onClose?: () => void;
  type?: "relative" | "fixed";
  withCloseButton?: boolean;
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                                               | Type                                                                                                      |
| :--------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| <a id="sdkerrorcomponentprops-error"></a> `error?`                     | [`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)               |
| <a id="sdkerrorcomponentprops-message"></a> `message`                  | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L436) |
| <a id="sdkerrorcomponentprops-onclose"></a> `onClose?`                 | () => `void`                                                                                              |
| <a id="sdkerrorcomponentprops-type"></a> `type?`                       | `"relative"` \| `"fixed"`                                                                                 |
| <a id="sdkerrorcomponentprops-withclosebutton"></a> `withCloseButton?` | `boolean`                                                                                                 |

<!-- [<endsnippet properties>] -->
