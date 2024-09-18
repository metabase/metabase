import { useCallback, useEffect, useState } from "react";

import Styles from "metabase/css/core/index.css";
import { Flex, Icon, Input } from "metabase/ui";

export function CommentInput({
  onSubmit,
  placeholder,
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
}) {
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
    <Flex>
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
            onClick={handleSubmit}
          />
        }
      />
    </Flex>
  );
}
