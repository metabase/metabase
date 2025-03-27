```ts
type Table = {
  active: boolean;
  caveats: string;
  created_at: string;
  db: Database;
  db_id: DatabaseId;
  description: string | null;
  dimension_options: Record<string, FieldDimensionOption>;
  display_name: string;
  field_order: TableFieldOrder;
  fields: Field_2[];
  fks: ForeignKey[];
  id: TableId;
  initial_sync_status: InitialSyncStatus;
  is_upload: boolean;
  metrics: Card[];
  name: string;
  points_of_interest: string;
  schema: SchemaName;
  segments: Segment[];
  type: CardType;
  updated_at: string;
  visibility_type: TableVisibilityType;
};
```

#### Properties

##### active

```ts
active: boolean;
```

***

##### caveats?

```ts
optional caveats: string;
```

***

##### created\_at

```ts
created_at: string;
```

***

##### db?

```ts
optional db: Database;
```

***

##### db\_id

```ts
db_id: DatabaseId;
```

***

##### description

```ts
description: string | null;
```

***

##### dimension\_options?

```ts
optional dimension_options: Record<string, FieldDimensionOption>;
```

***

##### display\_name

```ts
display_name: string;
```

***

##### field\_order

```ts
field_order: TableFieldOrder;
```

***

##### fields?

```ts
optional fields: Field_2[];
```

***

##### fks?

```ts
optional fks: ForeignKey[];
```

***

##### id

```ts
id: TableId;
```

***

##### initial\_sync\_status

```ts
initial_sync_status: InitialSyncStatus;
```

***

##### is\_upload

```ts
is_upload: boolean;
```

***

##### metrics?

```ts
optional metrics: Card[];
```

***

##### name

```ts
name: string;
```

***

##### points\_of\_interest?

```ts
optional points_of_interest: string;
```

***

##### schema

```ts
schema: SchemaName;
```

***

##### segments?

```ts
optional segments: Segment[];
```

***

##### type?

```ts
optional type: CardType;
```

***

##### updated\_at

```ts
updated_at: string;
```

***

##### visibility\_type

```ts
visibility_type: TableVisibilityType;
```
