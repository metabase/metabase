```ts
type MetabotErrorMessage = {
  message: string;
  type: "message" | "alert" | "locked";
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                           | Type                                   | Description                                                                               |
| :------------------------------------------------- | :------------------------------------- | :---------------------------------------------------------------------------------------- |
| <a id="metaboterrormessage-message"></a> `message` | `string`                               | -                                                                                         |
| <a id="metaboterrormessage-type"></a> `type`       | `"message"` \| `"alert"` \| `"locked"` | `"alert"` renders with a warning icon and error color; `"message"` renders as plain text. |

<!-- [<endsnippet properties>] -->
