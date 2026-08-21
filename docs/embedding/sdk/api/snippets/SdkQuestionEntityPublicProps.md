```ts
type SdkQuestionEntityPublicProps =
  | {
      query?: never;
      questionId: SdkQuestionId | null;
      token?: never;
    }
  | {
      query?: never;
      questionId?: never;
      token: SdkEntityToken | null;
    };
```

## Type Declaration

<!-- [<snippet type-declaration>] -->

```ts
{
  query?: never;
  questionId: SdkQuestionId | null;
  token?: never;
}
```

| Name         | Type                                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :----------- | :-------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query?`     | `never`                                             | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `questionId` | [`SdkQuestionId`](./api/SdkQuestionId.md) \| `null` | The ID of the question. <br/> This is either: <br/> - the numerical ID when accessing a question link, i.e. `http://localhost:3000/question/1-my-question` where the ID is `1` <br/> - the string ID found in the `entity_id` key of the question object when using the API directly or using the SDK Collection Browser to return data <br/> - `new` to show the notebook editor for creating new questions <br/> - `new-native` to show the SQL editor for creating new native questions |
| `token?`     | `never`                                             | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

```ts
{
  query?: never;
  questionId?: never;
  token: SdkEntityToken | null;
}
```

| Name          | Type                                                  | Description                            |
| :------------ | :---------------------------------------------------- | :------------------------------------- |
| `query?`      | `never`                                               | -                                      |
| `questionId?` | `never`                                               | -                                      |
| `token`       | [`SdkEntityToken`](./api/SdkEntityToken.md) \| `null` | A valid JWT token for the guest embed. |

<!-- [<endsnippet type-declaration>] -->
