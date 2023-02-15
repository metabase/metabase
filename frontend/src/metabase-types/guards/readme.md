# Type Guards

Place all reusable type guard functions in this directory. To help keep things organized, please name the guards files in parallel to their corresponding type definition files from the `/api` directory.

Type guards are functions that take a value and return a boolean indicating whether or not the value is of a certain type.  For example:

```ts
function isString(value) {
  return typeof value === "string";
}
```

This is far more useful with more complex types.

```ts
function isFish(pet: Fish | Bird): pet is Fish {
  return (pet as Fish).swim !== undefined;
}

// avoids type errors in a situation like this

if (isFish(pet)) {
  pet.swim();
}
```


https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
