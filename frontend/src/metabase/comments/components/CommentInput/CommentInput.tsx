import { useEffect, useState } from "react";

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onSubmit(text);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [text, onSubmit]);

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
          />
        }
      />
    </Flex>
  );
}
