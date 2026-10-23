```ts
type MetabotErrorMessage = {
  message: string;
  type: "message" | "alert" | "locked";
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                       | Type                                   | Description                                                                               |
| :----------------------------- | :------------------------------------- | :---------------------------------------------------------------------------------------- |
| <a id="message"></a> `message` | `string`                               | -                                                                                         |
| <a id="type"></a> `type`       | `"message"` \| `"alert"` \| `"locked"` | `"alert"` renders with a warning icon and error color; `"message"` renders as plain text. |

<!-- [<endsnippet properties>] -->
