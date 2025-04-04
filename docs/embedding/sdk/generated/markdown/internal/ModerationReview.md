```ts
type ModerationReview = {
  created_at: string;
  moderator_id: number;
  most_recent: boolean;
  status: ModerationReviewStatus;
  user: BaseUser;
};
```

## Properties

### created_at

```ts
created_at: string;
```

---

### moderator_id

```ts
moderator_id: number;
```

---

### most_recent?

```ts
optional most_recent: boolean;
```

---

### status

```ts
status: ModerationReviewStatus;
```

---

### user

```ts
user: BaseUser;
```
