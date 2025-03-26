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

### created\_at

```ts
created_at: string;
```

***

### moderator\_id

```ts
moderator_id: number;
```

***

### most\_recent?

```ts
optional most_recent: boolean;
```

***

### status

```ts
status: ModerationReviewStatus;
```

***

### user

```ts
user: BaseUser;
```
