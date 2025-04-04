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

## Properties

### hidden?

```ts
optional hidden: boolean;
```

---

### id

```ts
id: string;
```

---

### props

```ts
props: Record<string, unknown>;
```

---

### section

```ts
section: string;
```

---

### title?

```ts
optional title: string;
```

---

### widget

```ts
widget: () => JSX.Element | null | undefined;
```
