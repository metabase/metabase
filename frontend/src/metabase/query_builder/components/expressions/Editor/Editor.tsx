import CodeMirror from "@uiw/react-codemirror";

import S from "./Editor.module.css";
import { useExtensions } from "./extensions";

export function Editor() {
  const extensions = useExtensions();
  return (
    <CodeMirror
      // ref={editor}
      data-testid="native-query-editor"
      className={S.editor}
      extensions={extensions}
      // value={query.queryText()}
      // readOnly={readOnly}
      // onChange={onChange}
      height="100%"
      // onUpdate={handleUpdate}
    />
  );
}
