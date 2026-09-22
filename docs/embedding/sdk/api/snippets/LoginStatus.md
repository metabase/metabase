```ts
type LoginStatus =
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
