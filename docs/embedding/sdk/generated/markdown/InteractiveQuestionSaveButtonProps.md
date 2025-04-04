```ts
type InteractiveQuestionSaveButtonProps = {
  onClick: MouseEventHandler<HTMLButtonElement>;
} & ButtonProps;
```

## Type declaration

| Name       | Type                                       | Description                                                |
| ---------- | ------------------------------------------ | ---------------------------------------------------------- |
| `onClick?` | `MouseEventHandler`\<`HTMLButtonElement`\> | A handler function to be called when the button is clicked |

## Remarks

Uses [Mantine Button props](https://v7.mantine.dev/core/button/?t=props) under the hood
