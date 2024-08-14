import { t } from "ttag";

import Popover from "metabase/components/Popover";

import {
  Anchor,
  Container,
  IconStyled as Icon,
} from "./RightClickPopover.styled";

interface RightClickPopoverProps {
  isOpen: boolean;
  canSaveSnippets: boolean;
  target: () => Element | null | undefined;
  runQuery: () => void;
  openSnippetModalWithSelectedText: () => void;
}

export const RightClickPopover = ({
  isOpen,
  target,
  runQuery,
  openSnippetModalWithSelectedText,
  canSaveSnippets,
}: RightClickPopoverProps) => (
  <Popover isOpen={isOpen} target={target}>
    <Container>
      <Anchor onClick={runQuery}>
        <Icon name="play" size={16} />
        <h4>{t`Run selection`}</h4>
      </Anchor>
      {canSaveSnippets && (
        <Anchor onClick={openSnippetModalWithSelectedText}>
          <Icon name="snippet" size={16} />
          <h4>{t`Save as snippet`}</h4>
        </Anchor>
      )}
    </Container>
  </Popover>
);
