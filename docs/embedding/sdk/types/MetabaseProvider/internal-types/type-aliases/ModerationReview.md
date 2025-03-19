```ts
type ModerationReview = {
  created_at: string;
  moderator_id: number;
  most_recent: boolean;
  status: ModerationReviewStatus;
  user: BaseUser;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="created_at"></a> `created_at` | `string` |
| <a id="moderator_id"></a> `moderator_id` | `number` |
| <a id="most_recent"></a> `most_recent`? | `boolean` |
| <a id="status"></a> `status` | [`ModerationReviewStatus`](ModerationReviewStatus.md) |
| <a id="user"></a> `user` | [`BaseUser`](../interfaces/BaseUser.md) |
