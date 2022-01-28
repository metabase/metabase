import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Flex } from "grid-styled";

import { color } from "metabase/lib/colors";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";

PinUnpinDropTarget.propTypes = {
  variant: PropTypes.oneOf(["pin", "unpin"]).isRequired,
};

function PinUnpinDropTarget({ variant }) {
  return (
    <PinDropTarget
      variant={variant}
      pinIndex={variant === "pin" ? 1 : null}
      hideUntilDrag
      margin={10}
    >
      {({ hovered }) => (
        <Flex
          align="center"
          justify="center"
          py={2}
          m={2}
          color={hovered ? color("brand") : color("text-medium")}
        >
          {variant === "pin" ? t`Drag here to pin` : t`Drag here to un-pin`}
        </Flex>
      )}
    </PinDropTarget>
  );
}

export default PinUnpinDropTarget;
