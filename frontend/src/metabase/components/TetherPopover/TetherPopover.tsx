import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import Tether from "tether";

import SandboxedPortal from "metabase/components/SandboxedPortal";
import { useTether, TetherInstance } from "./use-tether";

TetherPopover.propTypes = {
  tetherOptions: PropTypes.object,
  renderTarget: PropTypes.func.isRequired,
  renderContent: PropTypes.func.isRequired,
  onRepositioned: PropTypes.func,
};

type Props = {
  renderTarget: (runTether: (targetEl: HTMLElement) => void) => React.ReactNode;
  renderContent: () => React.ReactNode;
  tetherOptions: Tether.ITetherOptions;
  onRepositioned?: (tether: TetherInstance) => void;
};

function TetherPopover({
  renderTarget,
  renderContent,
  tetherOptions,
  onRepositioned,
}: Props) {
  const { runTether, containerEl } = useTether({
    tetherOptions,
    onRepositioned,
  });

  return (
    <React.Fragment>
      {renderTarget(runTether)}
      {containerEl ? (
        <SandboxedPortal container={containerEl}>
          {renderContent()}
        </SandboxedPortal>
      ) : null}
    </React.Fragment>
  );
}

export default TetherPopover;
