```ts
const Query: unique symbol;
```

An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
