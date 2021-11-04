import React, { useRef } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import SandboxedPortal from "metabase/components/SandboxedPortal";
import { useTether } from "./use-tether";
import { PaddedPopoverBody } from "./TetherPopover.styled";

TetherPopover.propTypes = {
  tetherOptions: PropTypes.object,
  renderTarget: PropTypes.func.isRequired,
  renderContent: PropTypes.func.isRequired,
  onRepositioned: PropTypes.func,
};

function TetherPopover({
  renderTarget,
  renderContent,
  tetherOptions,
  onRepositioned,
}) {
  const contentRef = useRef();

  const { runTether, containerEl } = useTether({
    tetherOptions,
    onRepositioned,
  });

  return (
    <React.Fragment>
      {renderTarget(runTether)}
      {containerEl ? (
        <SandboxedPortal container={containerEl}>
          <PaddedPopoverBody>{renderContent(contentRef)}</PaddedPopoverBody>
        </SandboxedPortal>
      ) : null}
    </React.Fragment>
  );
}

export default TetherPopover;
