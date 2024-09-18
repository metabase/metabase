import { useCallback, useState } from "react";

import Styles from "metabase/css/core/index.css";
import { Avatar, Flex, type FlexProps, Icon, Input } from "metabase/ui";

export function CommentInput({
  onSubmit,
  placeholder,
  autoFocus,
  ...flexProps
}: {
  onSubmit: (text: string) => Promise<void>;
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
      <Avatar radius="xl" c="text-light" size="1.5rem" color="text-light" />

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
