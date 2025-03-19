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
  subTitle: React.ReactNode;
  title: React.ReactNode;
  tooltip: string;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="buttontype"></a> `buttonType` | [`ClickActionButtonType`](ClickActionButtonType.md) |
| <a id="extra"></a> `extra`? | () => `Record`\<`string`, `unknown`\> |
| <a id="icon"></a> `icon`? | [`IconName`](IconName.md) |
| <a id="icontext"></a> `iconText`? | `string` |
| <a id="name"></a> `name` | `string` |
| <a id="section"></a> `section` | [`ClickActionSection`](ClickActionSection.md) |
| <a id="sectiondirection"></a> `sectionDirection`? | [`ClickActionSectionDirection`](ClickActionSectionDirection.md) |
| <a id="sectiontitle"></a> `sectionTitle`? | `string` |
| <a id="subtitle"></a> `subTitle`? | `React.ReactNode` |
| <a id="title"></a> `title`? | `React.ReactNode` |
| <a id="tooltip"></a> `tooltip`? | `string` |
