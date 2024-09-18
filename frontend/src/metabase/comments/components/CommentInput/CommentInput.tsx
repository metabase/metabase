import { useCallback, useState } from "react";
import { Mention, MentionsInput } from "react-mentions";

import { useListUsersQuery } from "metabase/api";
import Styles from "metabase/css/core/index.css";
import { Flex, type FlexProps, Icon } from "metabase/ui";
import type { User } from "metabase-types/api";

import { UserIcon } from "../comment/Comment";

import CommentInputStyle from "./CommentInput.module.css";

export function CommentInput({
  onSubmit,
  placeholder,
  autoFocus,
  user,
  ...flexProps
}: {
  onSubmit: (text: string) => Promise<void>;
  user: User;
  placeholder: string;
  autoFocus: boolean;
} & FlexProps) {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(
    (text: string) => {
      onSubmit(text).then(() => setText(""));
    },
    [onSubmit],
  );

  const { data: users } = useListUsersQuery({});

  return (
    <Flex align="center" gap="sm" {...flexProps}>
      <UserIcon user={user} />
      <MentionsInput
        value={text}
        onKeyDown={e => {
          if (e.key === "Enter") {
            handleSubmit(text);
          }
        }}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        autoFocus
        singleLine
        className="mentions"
        classNames={CommentInputStyle}
        style={{
          suggestions: {
            background: "red",
          },
        }}
      >
        <Mention
          markup="@[__display__](__id__)"
          trigger="@"
          data={
            users?.data.map(user => {
              return { id: user.id, display: user.common_name };
            }) ?? []
          }
        />
      </MentionsInput>
      {text && (
        <Icon
          style={{
            position: "absolute",
            top: 26,
            right: 12,
          }}
          name="enter_or_return"
          color="var(--mb-color-brand)"
          className={Styles.cursorPointer}
          onClick={() => handleSubmit(text)}
        />
      )}
    </Flex>
  );
}
