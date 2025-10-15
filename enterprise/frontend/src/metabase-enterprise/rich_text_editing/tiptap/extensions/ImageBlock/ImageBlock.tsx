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
  selected,
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
      const { data } = await uploadImage({
        file,
        collectionId: doc?.collection_id as any,
      });

      updateAttributes({
        url: data?.url,
      });
    },
    [uploadImage, doc, updateAttributes],
  );

  const [selectedItem, setSelectedItem] = useState<any>(null);

  return (
    <NodeViewWrapper className={cx(S.root)} contentEditable={false}>
      {node.attrs.url ? (
        <img src={node.attrs.url} className={S.image} />
      ) : (
        <Flex
          gap="xs"
          align="center"
          direction="row"
          className={cx(S.imageBlockContainer, {
            [S.selected]: selected,
          })}
        >
          <Icon name="snail" size={16} color="var(--mb-color-text-light)" />
          <Text
            style={{ userSelect: "none", color: "var(--mb-color-text-light)" }}
          >{t`Add an image`}</Text>
          <label className={S.uploadWrapper} htmlFor="file-upload-input">
            <Button
              onClick={() => {
                document.getElementById("file-upload-input")?.click();
              }}
              leftSection={<Icon name="upload" size={16} />}
              variant="subtle"
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
            variant="subtle"
            size="xs"
            onClick={() => setShowPicker(true)}
          >{t`Browse collections`}</Button>
          {showPicker && rendered && (
            <QuestionPickerModal
              title={t`Select an image yo`}
              value={selectedItem}
              models={["image"]}
              onClose={() => setShowPicker(false)}
              onChange={(item: any) => {
                if (item.id === "root") {
                  setSelectedItem(null);
                } else if (item.model === "image") {
                  updateAttributes({ url: `/api/images/${item.id}/contents` });
                  setShowPicker(false);
                } else {
                  setSelectedItem(item);
                }
              }}
            />
          )}
        </Flex>
      )}
    </NodeViewWrapper>
  );
};
