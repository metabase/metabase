```ts
type ButtonProps = Omit<ButtonProps_2, "size" | "variant" | "color"> & {
  color?: "brand" | "filter" | "negative" | "positive" | "warning" | "neutral";
  size?: "sm" | "md" | "lg" | "compact-sm" | "compact-md";
  variant?:
    | "default"
    | "filled"
    | "light"
    | "subtle"
    | "transparent"
    | "on-dark-primary"
    | "on-dark-secondary";
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

## Type Declaration

<!-- [<snippet type-declaration>] -->

| Name       | Type                                                                                                                       |
| :--------- | :------------------------------------------------------------------------------------------------------------------------- |
| `color?`   | `"brand"` \| `"filter"` \| `"negative"` \| `"positive"` \| `"warning"` \| `"neutral"`                                      |
| `size?`    | `"sm"` \| `"md"` \| `"lg"` \| `"compact-sm"` \| `"compact-md"`                                                             |
| `variant?` | \| `"default"` \| `"filled"` \| `"light"` \| `"subtle"` \| `"transparent"` \| `"on-dark-primary"` \| `"on-dark-secondary"` |

<!-- [<endsnippet type-declaration>] -->
