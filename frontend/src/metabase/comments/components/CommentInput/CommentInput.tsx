import { useCallback, useState } from "react";

import Styles from "metabase/css/core/index.css";
import { Flex, type FlexProps, Icon, Input } from "metabase/ui";
import type { User } from "metabase-types/api";

import { UserIcon } from "../comment/Comment";

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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit(text);
    }
  };

  return (
    <Flex align="center" gap="sm" {...flexProps}>
      <UserIcon user={user} />

      <Input
        onKeyDown={handleKeyDown}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1 }}
        autoFocus={autoFocus}
        rightSection={
          text && (
            <Icon
              name="enter_or_return"
              color="var(--mb-color-brand)"
              className={Styles.cursorPointer}
              onClick={() => handleSubmit(text)}
            />
          )
        }
      />
    </Flex>
  );
}
