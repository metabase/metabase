/* eslint-disable react/prop-types */
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { Button } from "metabase/common/components/Button";
import CS from "metabase/css/core/index.css";
import { Ellipsified, Flex, Icon } from "metabase/ui";

import SnippetRowS from "./SnippetRow.module.css";

export function SnippetRow({
  item: snippet,
  insertSnippet,
  setModalSnippet,
  canWrite,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [updateSnippet] = useUpdateSnippetMutation();

  const { description, content } = snippet;

  return (
    <div
      className={cx(
        { [CS.borderTransparent]: !isOpen },
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
        style={{ minWidth: 0 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Flex
          className={SnippetRowS.SnippetContent}
          onClick={
            snippet.archived
              ? () => setIsOpen(true)
              : (e) => {
                  e.stopPropagation();
                  insertSnippet(snippet);
                }
          }
          miw={0}
        >
          <Icon
            name="snippet"
            className={cx(
              CS.hoverChildHidden,
              CS.textLight,
              SnippetRowS.SnippetIcon,
            )}
          />
          <Icon
            name={insertSnippet ? "arrow_left_to_line" : "snippet"}
            className={cx(CS.hoverChild, SnippetRowS.SnippetIcon)}
          />
          <Ellipsified className={cx(CS.ml1)}>{snippet.name}</Ellipsified>
        </Flex>
        <Icon
          name={isOpen ? "chevronup" : "chevrondown"}
          className={cx({ [CS.hoverChild]: !isOpen }, SnippetRowS.SnippetIcon)}
        />
      </div>
      {isOpen && (
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
            <Button
              className={SnippetRowS.SnippetButton}
              onClick={
                snippet.archived
                  ? () => updateSnippet({ id: snippet.id, archived: false })
                  : () => setModalSnippet(snippet)
              }
              borderless
              medium
              icon={snippet.archived ? "unarchive" : "pencil"}
            >
              {snippet.archived ? t`Unarchive` : t`Edit`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
