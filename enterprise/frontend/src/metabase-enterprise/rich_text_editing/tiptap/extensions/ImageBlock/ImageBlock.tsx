import type { NodeViewProps } from "@tiptap/core";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
} from "@tiptap/react";
import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useUploadImageMutation } from "metabase/api";
import { Button, Flex, Icon, Text } from "metabase/ui";

import S from "./ImageBlock.module.css";
import { useSelector } from "metabase/lib/redux";
import { getCurrentDocument } from "metabase-enterprise/documents/selectors";

export const ImageBlock = Node.create({
  name: "imageBlock",

  group: "block",

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "draggable-item" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockNodeView);
  },
});

export const ImageBlockNodeView = ({ node }: NodeViewProps) => {
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const doc = useSelector(getCurrentDocument);

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!rendered) {
      setRendered(true);
    }
  }, [rendered]);

  const [uploadImage] = useUploadImageMutation();

  const uploadFile = useCallback(
    async (file: File) => {
      await uploadImage({ file, collectionId: doc?.collection_id as any });
      setUrl("https://placehold.co/600x400");
    },
    [uploadImage, doc],
  );

  return (
    <NodeViewWrapper className={cx(S.root, {})}>
      {url ? (
        <img src={url} className={S.image} />
      ) : (
        <Flex
          gap="sm"
          align="center"
          direction="row"
          className={S.imageBlockContainer}
        >
          <Text style={{ userSelect: "none" }}>{t`Add an image`}</Text>
          <label className={S.uploadWrapper} htmlFor="file-upload-input">
            <Button
              onClick={() => {
                document.getElementById("file-upload-input")?.click();
              }}
              leftSection={<Icon name="upload" size={16} />}
              variant="outline"
              size="xs"
            >{t`Upload new`}</Button>
            <input
              id="file-upload-input"
              style={{ display: "none" }}
              type="file"
              onChange={(e) => uploadFile(e.target.files![0])}
            />
          </label>

          <Button
            leftSection={<Icon name="folder" size={16} />}
            variant="outline"
            size="xs"
          >{t`Browse collections`}</Button>
        </Flex>
      )}
    </NodeViewWrapper>
  );
};
