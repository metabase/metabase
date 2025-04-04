```ts
type FileUpload = {
  collectionId: CollectionId;
  error: string;
  id: number;
  message: string;
  modelId: string;
  name: string;
  status: "complete" | "in-progress" | "error";
  tableId: TableId;
  uploadMode: UploadMode;
};
```

## Properties

### collectionId?

```ts
optional collectionId: CollectionId;
```

---

### error?

```ts
optional error: string;
```

---

### id

```ts
id: number;
```

---

### message?

```ts
optional message: string;
```

---

### modelId?

```ts
optional modelId: string;
```

---

### name

```ts
name: string;
```

---

### status

```ts
status: "complete" | "in-progress" | "error";
```

---

### tableId?

```ts
optional tableId: TableId;
```

---

### uploadMode?

```ts
optional uploadMode: UploadMode;
```
