import type { User, UserId } from "metabase-types/api";

interface UserToken {
  token: string;
  userId: UserId;
}

export function toMentionDisplay(
  comment: string,
  userMapping: Record<UserId, Pick<User, "common_name">>,
) {
  const userTokens = getUserTokens(comment);
  return userTokens.reduce((translatedComment, userToken) => {
    const user = userMapping[userToken.userId];

    if (user) {
      return translatedComment.replace(userToken.token, `@${user.common_name}`);
    }

    return translatedComment;
  }, comment);
}

function getUserTokens(comment: string): UserToken[] {
  const tokens = comment.match(/<@\d+>/g) ?? [];
  return tokens.map(token => {
    const userId = token.match(/\d+/);
    return {
      token,
      userId: Number(userId),
    };
  });
}
