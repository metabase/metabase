/* eslint-disable react/prop-types */
import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { useGetSnippetQuery, useUpdateSnippetMutation } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

import { SnippetButton, SnippetContent } from "./SnippetRow.styled";

export type SnippetRowProps = {
  item: NativeQuerySnippet;
  insertSnippet?: (snippet: NativeQuerySnippet) => void;
  setModalSnippet?: (snippet: NativeQuerySnippet) => void;
  canWrite: boolean;
};

export const SnippetRow = ({
  item,
  insertSnippet,
  setModalSnippet,
  canWrite,
}: SnippetRowProps) => {
  const [opened, { open, toggle }] = useDisclosure();
  const { data: snippet } = useGetSnippetQuery(item.id);
  const [updateSnippet] = useUpdateSnippetMutation();

  if (!snippet) {
    return null;
  }

  const { description, content } = snippet;

  return (
    <div
      className={cx(
        { [CS.borderTransparent]: !opened },
        CS.borderBottom,
        CS.borderTop,
      )}
    >
      <div
        className={cx(
          CS.cursorPointer,
          CS.bgLightHover,
          CS.textBold,
          CS.flex,
          CS.alignCenter,
          CS.justifyBetween,
          CS.py2,
          CS.px3,
          CS.hoverParent,
          CS.hoverDisplay,
        )}
        onClick={toggle}
      >
        <SnippetContent
          onClick={
            snippet.archived
              ? open
              : e => {
                  e.stopPropagation();
                  insertSnippet?.(snippet);
                }
          }
        >
          <Icon
            name="snippet"
            className={cx(CS.hoverChildHidden, CS.textLight)}
          />
          <Icon
            name={insertSnippet ? "arrow_left_to_line" : "snippet"}
            className={CS.hoverChild}
          />
          <span className={cx(CS.flexFull, CS.ml1)}>{snippet.name}</span>
        </SnippetContent>
        <Icon
          name={opened ? "chevronup" : "chevrondown"}
          className={cx({ [CS.hoverChild]: !opened })}
        />
      </div>
      {opened && (
        <div className={cx(CS.px3, CS.pb2, CS.pt1)}>
          {description && (
            <p className={cx(CS.textMedium, CS.mt0)}>{description}</p>
          )}
          <pre
            className={cx(
              CS.bgLight,
              CS.bordered,
              CS.rounded,
              CS.p1,
              CS.textMonospace,
              CS.textSmall,
              CS.textPreWrap,
              CS.overflowAuto,
            )}
            style={{ maxHeight: 320 }}
          >
            {content}
          </pre>
          {canWrite && (
            <SnippetButton
              onClick={
                snippet.archived
                  ? () => updateSnippet({ id: snippet.id, archived: false })
                  : () => setModalSnippet?.(snippet)
              }
              borderless
              medium
              icon={snippet.archived ? "unarchive" : "pencil"}
            >
              {snippet.archived ? t`Unarchive` : t`Edit`}
            </SnippetButton>
          )}
        </div>
      )}
    </div>
  );
};
