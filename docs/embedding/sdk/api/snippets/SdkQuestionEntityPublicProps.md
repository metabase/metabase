```ts
type SdkQuestionEntityPublicProps =
  | {
      card?: never;
      query?: never;
      questionId: SdkQuestionId | null;
      token?: never;
    }
  | {
      card?: never;
      query?: never;
      questionId?: never;
      token: SdkEntityToken | null;
    }
  | {
      card: string | MetabaseCard;
      query?: never;
      questionId?: never;
      token?: never;
    }
  | {
      card?: never;
      query: MetabaseQueryObject | null;
      questionId?: never;
      token?: never;
    };
```

## Type Declaration

<!-- [<snippet type-declaration>] -->

```ts
{
  card?: never;
  query?: never;
  questionId: SdkQuestionId | null;
  token?: never;
}
```

| Name         | Type                                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :----------- | :-------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card?`      | `never`                                             | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `query?`     | `never`                                             | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `questionId` | [`SdkQuestionId`](./api/SdkQuestionId.md) \| `null` | The ID of the question. <br/> This is either: <br/> - the numerical ID when accessing a question link, i.e. `http://localhost:3000/question/1-my-question` where the ID is `1` <br/> - the string ID found in the `entity_id` key of the question object when using the API directly or using the SDK Collection Browser to return data <br/> - `new` to show the notebook editor for creating new questions <br/> - `new-native` to show the SQL editor for creating new native questions |
| `token?`     | `never`                                             | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

```ts
{
  card?: never;
  query?: never;
  questionId?: never;
  token: SdkEntityToken | null;
}
```

| Name          | Type                                                  | Description                            |
| :------------ | :---------------------------------------------------- | :------------------------------------- |
| `card?`       | `never`                                               | -                                      |
| `query?`      | `never`                                               | -                                      |
| `questionId?` | `never`                                               | -                                      |
| `token`       | [`SdkEntityToken`](./api/SdkEntityToken.md) \| `null` | A valid JWT token for the guest embed. |

```ts
{
  card: string | MetabaseCard;
  query?: never;
  questionId?: never;
  token?: never;
}
```

| Name          | Type                                                | Description                                                                                                                                                                                                         |
| :------------ | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `card`        | `string` \| [`MetabaseCard`](./api/MetabaseCard.md) | An ad-hoc question to render without saving it first. Either a [MetabaseCard](./api/MetabaseCard.md) object, or a serialized card string copied from a question URL hash (`/question#<base64>` or the bare base64). |
| `query?`      | `never`                                             | -                                                                                                                                                                                                                   |
| `questionId?` | `never`                                             | -                                                                                                                                                                                                                   |
| `token?`      | `never`                                             | -                                                                                                                                                                                                                   |

```ts
{
  card?: never;
  query: MetabaseQueryObject | null;
  questionId?: never;
  token?: never;
}
```

| Name          | Type                                                            | Description                                                        |
| :------------ | :-------------------------------------------------------------- | :----------------------------------------------------------------- |
| `card?`       | `never`                                                         | -                                                                  |
| `query`       | [`MetabaseQueryObject`](./api/MetabaseQueryObject.md) \| `null` | A table-backed ad hoc query created with `useMetabaseQueryObject`. |
| `questionId?` | `never`                                                         | -                                                                  |
| `token?`      | `never`                                                         | -                                                                  |

<!-- [<endsnippet type-declaration>] -->
