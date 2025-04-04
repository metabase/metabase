```ts
type ClickActionBase = {
  buttonType: ClickActionButtonType;
  extra: () => Record<string, unknown>;
  icon: IconName;
  iconText: string;
  name: string;
  section: ClickActionSection;
  sectionDirection: ClickActionSectionDirection;
  sectionTitle: string;
  subTitle: React_2.ReactNode;
  title: React_2.ReactNode;
  tooltip: string;
};
```

## Properties

### buttonType

```ts
buttonType: ClickActionButtonType;
```

---

### extra()?

```ts
optional extra: () => Record<string, unknown>;
```

#### Returns

`Record`\<`string`, `unknown`\>

---

### icon?

```ts
optional icon: IconName;
```

---

### iconText?

```ts
optional iconText: string;
```

---

### name

```ts
name: string;
```

---

### section

```ts
section: ClickActionSection;
```

---

### sectionDirection?

```ts
optional sectionDirection: ClickActionSectionDirection;
```

---

### sectionTitle?

```ts
optional sectionTitle: string;
```

---

### subTitle?

```ts
optional subTitle: React_2.ReactNode;
```

---

### title?

```ts
optional title: React_2.ReactNode;
```

---

### tooltip?

```ts
optional tooltip: string;
```
