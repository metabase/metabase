```ts
type ChartColorV2 =
  | string
  | {
      base: string;
      shade?: string;
      tint?: string;
    }
  | null;
```

Chart color definition for V2 themes.

Can be a simple color string or an object with base/tint/shade variants.

## Type Declaration

<!-- [<snippet type-declaration>] -->

`string`

```ts
{
  base: string;
  shade?: string;
  tint?: string;
}
```

| Name     | Type     | Description                         |
| :------- | :------- | :---------------------------------- |
| `base`   | `string` | -                                   |
| `shade?` | `string` | Darker variation of the base color  |
| `tint?`  | `string` | Lighter variation of the base color |

`null`

<!-- [<endsnippet type-declaration>] -->
