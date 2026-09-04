```ts
type InitializationStatus =
  | {
      status: "uninitialized";
    }
  | {
      status: "success";
    }
  | {
      status: "loading";
    }
  | {
      error: Error;
      status: "error";
    };
```
