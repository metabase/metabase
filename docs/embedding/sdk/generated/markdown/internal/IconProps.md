```ts
type IconProps = SVGAttributes<SVGSVGElement> &
  BoxProps & {
    className: string;
    name: IconName;
    onClick: (event: MouseEvent_2<HTMLImageElement | SVGElement>) => void;
    size: string | number;
    tooltip: ReactNode;
  };
```

## Type declaration

| Name         | Type                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| `className?` | `string`                                                                  |
| `name`       | [`IconName`](IconName.md)                                                 |
| `onClick?`   | (`event`: `MouseEvent_2`\<`HTMLImageElement` \| `SVGElement`\>) => `void` |
| `size?`      | `string` \| `number`                                                      |
| `tooltip?`   | `ReactNode`                                                               |
