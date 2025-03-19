```ts
type IconProps = SVGAttributes<SVGSVGElement> & BoxProps & {
  className: string;
  name: IconName;
  onClick: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
  size: string | number;
  tooltip: ReactNode;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `className`? | `string` |
| `name` | [`IconName`](../../../../MetabaseProvider/internal-types/type-aliases/IconName.md) |
| `onClick`? | (`event`: `MouseEvent`\<`HTMLImageElement` \| `SVGElement`\>) => `void` |
| `size`? | `string` \| `number` |
| `tooltip`? | `ReactNode` |
