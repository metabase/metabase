## CreateQuestionProps

```ts
type CreateQuestionProps = Partial<Omit<InteractiveQuestionProps, "questionId" | "children">>;
```

***

## ~~CreateQuestion()~~

```ts
function CreateQuestion(props: Partial): Element
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `props` | `Partial` |

### Returns

`Element`

### Deprecated

Use `<InteractiveQuestion questionId="new" />` instead.
