```ts
type InteractiveQuestionBackButtonProps = Omit<
  Omit<ActionIconProps, "color" | "size" | "variant"> & {
    color?: "brand" | "negative" | "positive" | "warning" | "neutral";
    selected?: boolean;
    size?: "sm" | "md" | "lg" | "xs";
    variant?:
      | "default"
      | "filled"
      | "light"
      | "subtle"
      | "on-dark-primary"
      | "on-dark-secondary";
  } & ButtonHTMLAttributes<HTMLButtonElement> &
    HTMLAttributes<HTMLButtonElement>,
  "noLink" | "onClick"
>;
```

**`Expand`**
