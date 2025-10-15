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
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import { useSelector } from "metabase/lib/redux";
import { Button, Flex, Icon, Text } from "metabase/ui";
import { getCurrentDocument } from "metabase-enterprise/documents/selectors";

import S from "./ImageBlock.module.css";

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

  addAttributes() {
    return {
      url: {
        default: null,
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockNodeView);
  },
});

export const ImageBlockNodeView = ({
  updateAttributes,
  node,
}: NodeViewProps) => {
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const doc = useSelector(getCurrentDocument);

  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!rendered) {
      setRendered(true);
    }
  }, [rendered]);

  const [uploadImage] = useUploadImageMutation();

  const uploadFile = useCallback(
    async (file: File) => {
      await uploadImage({ file, collectionId: doc?.collection_id as any });
      updateAttributes({
        url: "https://placehold.co/600x400",
      });
    },
    [uploadImage, doc, updateAttributes],
  );

  return (
    <NodeViewWrapper className={cx(S.root, {})}>
      {node.attrs.url ? (
        <img src={node.attrs.url} className={S.image} />
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
            onClick={() => setShowPicker(true)}
          >{t`Browse collections`}</Button>
          {showPicker && rendered && (
            <QuestionPickerModal
              title={t`Select an image yo`}
              models={["image"]}
              onClose={() => setShowPicker(false)}
              onChange={(item) => {
                console.log(item);
                setShowPicker(false);
              }}
            />
          )}
        </Flex>
      )}
    </NodeViewWrapper>
  );
};
