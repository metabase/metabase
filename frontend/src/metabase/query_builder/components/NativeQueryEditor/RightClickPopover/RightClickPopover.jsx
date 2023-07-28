import PropTypes from "prop-types";
import { t } from "ttag";

import Popover from "metabase/components/Popover";
import {
  Anchor,
  Container,
  IconStyled as Icon,
} from "./RightClickPopover.styled";

const propTypes = {
  isOpen: PropTypes.bool,
  target: PropTypes.func,
  runQuery: PropTypes.func,
  openSnippetModalWithSelectedText: PropTypes.func,
  canSaveSnippets: PropTypes.bool,
};

const NativeQueryEditorRightClickPopover = ({
  isOpen,
  target,
  runQuery,
  openSnippetModalWithSelectedText,
  canSaveSnippets,
}) => (
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

NativeQueryEditorRightClickPopover.propTypes = propTypes;

export default NativeQueryEditorRightClickPopover;
