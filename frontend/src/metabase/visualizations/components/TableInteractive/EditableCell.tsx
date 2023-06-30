import { useState, useEffect } from "react";
import { useClickOutside } from "@mantine/hooks";

function fetchFromStore(storageKey) {
  const store = window.localStorage.getItem(storageKey);
  const comments = JSON.parse(store || "{}");
  return comments;
}

export function EditableCell({
  row,
  questionId,
}: {
  row: any;
  questionId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const data = fetchFromStore(`mb-data-${questionId}`);
    setValue(data[row[0]] || "");
  }, [row, questionId]);

  const ref = useClickOutside(() => saveAndExit());

  function saveAndExit() {
    const data = fetchFromStore(`mb-data-${questionId}`);
    window.localStorage.setItem(
      `mb-data-${questionId}`,
      JSON.stringify({
        ...data,
        [row[0]]: value,
      }),
    );
    setIsEditing(false);
  }
  return (
    <div
      onDoubleClick={() => setIsEditing(true)}
      ref={ref}
      className="hover-parent hover--visibility full"
    >
      {isEditing ? (
        <div className="bg-white bordered rounded shadowed absolute top left right zF">
          <div className="full">
            <textarea
              value={value}
              style={{ width: "100%" }}
              autoFocus
              onChange={ev => setValue(ev.target.value)}
            />
          </div>
        </div>
      ) : value ? (
        value
      ) : (
        <span className="hover-child text-light">
          Double click to add a comment
        </span>
      )}
    </div>
  );
}
