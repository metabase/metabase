import { useCallback, useEffect, useState } from "react";

import Styles from "metabase/css/core/index.css";
import { Flex, type FlexProps, Icon, Input } from "metabase/ui";

export function CommentInput({
  onSubmit,
  placeholder,
  ...flexProps
}: {
  onSubmit: (text: string) => Promise<void>;
  placeholder: string;
} & FlexProps) {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(
    (text: string) => {
      onSubmit(text).then(() => setText(""));
    },
    [onSubmit],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit(text);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [text, handleSubmit]);

  return (
    <Flex {...flexProps}>
      <Input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        autoFocus
        style={{ flex: 1 }}
        rightSection={
          <Icon
            name="enter_or_return"
            color="var(--mb-color-brand)"
            className={Styles.cursorPointer}
            onClick={() => handleSubmit(text)}
          />
        }
      />
    </Flex>
  );
}
