```ts
type Dispatch<T> = (action: T) => unknown | Promise<unknown>;
```

#### Type Parameters

| Type Parameter | Default type |
| -------------- | ------------ |
| `T`            | `any`        |

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `action`  | `T`  |

#### Returns

`unknown` | `Promise`<`unknown`>
