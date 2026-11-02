```ts
type MetabotIncompleteResponse = {
  continueResponse?: () => Promise<void>;
  message: string;
  reason:
    | "step-limit"
    | "max-length"
    | "context-window-full"
    | "content-filter"
    | "other";
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                          | Type                                                                                                            | Description                                                                         |
| :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| <a id="continueresponse"></a> `continueResponse?` | () => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\> | Resume the response where it left off. Absent when the response can't be continued. |
| <a id="message"></a> `message`                    | `string`                                                                                                        | User-friendly explanation of why the response stopped.                              |
| <a id="reason"></a> `reason`                      | \| `"step-limit"` \| `"max-length"` \| `"context-window-full"` \| `"content-filter"` \| `"other"`               | Why the latest response stopped before it finished.                                 |

<!-- [<endsnippet properties>] -->
