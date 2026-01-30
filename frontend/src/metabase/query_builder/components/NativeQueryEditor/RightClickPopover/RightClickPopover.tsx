import { t } from "ttag";

import { Popover } from "metabase/common/components/Popover";
import { Flex, Icon } from "metabase/ui";

import RightClickPopoverS from "./RightClickPopover.module.css";

interface RightClickPopoverProps {
  isOpen: boolean;
  canSaveSnippets: boolean;
  target: () => Element | null | undefined;
  runQuery?: () => void;
  openSnippetModalWithSelectedText?: () => void;
}

export const RightClickPopover = ({
  isOpen,
  target,
  runQuery,
  openSnippetModalWithSelectedText,
  canSaveSnippets,
}: RightClickPopoverProps) => (
  <Popover isOpen={isOpen} target={target}>
    <Flex direction="column">
      {runQuery && (
        <a className={RightClickPopoverS.Anchor} onClick={runQuery}>
          <Icon mr="sm" name="play" size={16} />
          <h4>{t`Run selection`}</h4>
        </a>
      )}
      {canSaveSnippets && openSnippetModalWithSelectedText && (
        <a
          className={RightClickPopoverS.Anchor}
          onClick={openSnippetModalWithSelectedText}
        >
          <Icon mr="sm" name="snippet" size={16} />
          <h4>{t`Save as snippet`}</h4>
        </a>
      )}
    </Flex>
  </Popover>
);
