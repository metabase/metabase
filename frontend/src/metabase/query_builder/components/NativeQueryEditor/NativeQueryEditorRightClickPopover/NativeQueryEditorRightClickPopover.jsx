import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import {
  Anchor,
  Container,
  IconStyled as Icon,
} from "./NativeQueryEditorRightClickPopover.styled";
import Popover from "metabase/components/Popover";

const propTypes = {
  isOpen: PropTypes.bool,
  target: PropTypes.func,
  runQuery: PropTypes.func,
  openSnippetModalWithSelectedText: PropTypes.func,
};

const NativeQueryEditorRightClickPopover = ({
  isOpen,
  target,
  runQuery,
  openSnippetModalWithSelectedText,
}) => (
  <Popover isOpen={isOpen} target={target}>
    <Container>
      <Anchor onClick={runQuery}>
        <Icon name={"play"} size={16} />
        <h4>{t`Run selection`}</h4>
      </Anchor>
      <Anchor onClick={openSnippetModalWithSelectedText}>
        <Icon name={"snippet"} size={16} />
        <h4>{t`Save as snippet`}</h4>
      </Anchor>
    </Container>
  </Popover>
);

NativeQueryEditorRightClickPopover.propTypes = propTypes;

export default NativeQueryEditorRightClickPopover;
