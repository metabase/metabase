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

| Property                                        | Type                                                                                                      |
| :---------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| <a id="error"></a> `error?`                     | [`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)               |
| <a id="message"></a> `message`                  | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L436) |
| <a id="onclose"></a> `onClose?`                 | () => `void`                                                                                              |
| <a id="type"></a> `type?`                       | `"relative"` \| `"fixed"`                                                                                 |
| <a id="withclosebutton"></a> `withCloseButton?` | `boolean`                                                                                                 |

<!-- [<endsnippet properties>] -->
