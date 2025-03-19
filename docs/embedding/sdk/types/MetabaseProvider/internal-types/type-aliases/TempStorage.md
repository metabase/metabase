```ts
type TempStorage = {
  last-opened-onboarding-checklist-item: ChecklistItemValue | undefined;
};
```

Storage for non-critical, ephemeral user preferences.
Think of it as a sessionStorage alternative implemented in Redux.
Only specific key/value pairs can be stored here,
and then later used with the `use-temp-storage` hook.

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="last-opened-onboarding-checklist-item"></a> `last-opened-onboarding-checklist-item` | [`ChecklistItemValue`](ChecklistItemValue.md) \| `undefined` |
