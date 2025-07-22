import { Flex } from "metabase/ui";

import type { TransformInfo } from "../../types";

import { EditorHeader } from "./EditorHeader";

type TransformEditorProps = {
  transform: TransformInfo;
};

export function TransformEditor({ transform }: TransformEditorProps) {
  return (
    <Flex h="100%" direction="column" bg="white">
      <EditorHeader
        transform={transform}
        onCreate={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    </Flex>
  );
}
