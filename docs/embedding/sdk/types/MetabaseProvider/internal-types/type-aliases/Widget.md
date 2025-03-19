```ts
type Widget = {
  hidden: boolean;
  id: string;
  props: Record<string, unknown>;
  section: string;
  title: string;
  widget: () => JSX.Element | null | undefined;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="hidden"></a> `hidden`? | `boolean` |
| <a id="id"></a> `id` | `string` |
| <a id="props"></a> `props` | `Record`\<`string`, `unknown`\> |
| <a id="section"></a> `section` | `string` |
| <a id="title"></a> `title`? | `string` |
| <a id="widget"></a> `widget` | () => `JSX.Element` \| `null` \| `undefined` |
