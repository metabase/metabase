```ts
type ChartColor =
  | string
  | {
      base: string;
      shade: string;
      tint: string;
    };
```

## Type declaration

`string`

\{
`base`: `string`;
`shade`: `string`;
`tint`: `string`;
\}

| Name     | Type     | Description                         |
| -------- | -------- | ----------------------------------- |
| `base`   | `string` | -                                   |
| `shade?` | `string` | Darker variation of the base color  |
| `tint?`  | `string` | Lighter variation of the base color |
