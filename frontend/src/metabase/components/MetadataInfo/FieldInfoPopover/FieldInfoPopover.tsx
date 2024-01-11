import PropTypes from "prop-types";
import { hideAll } from "tippy.js";

import type { ITippyPopoverProps } from "metabase/components/Popover/TippyPopover";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Field from "metabase-lib/metadata/Field";

import { WidthBoundFieldInfo } from "./FieldInfoPopover.styled";

export const POPOVER_DELAY: [number, number] = [1000, 300];

const propTypes = {
  field: PropTypes.instanceOf(Field),
  children: PropTypes.node,
  placement: PropTypes.string,
  disabled: PropTypes.bool,
};

type Props = { field?: Field; description?: string } & Pick<
  ITippyPopoverProps,
  "children" | "placement" | "disabled" | "delay"
>;

const className = "dimension-info-popover";

function FieldInfoPopover({
  field,
  description,
  children,
  placement,
  disabled,
  delay = POPOVER_DELAY,
}: Props) {
  return (
    <TippyPopover
      className={className}
      delay={delay}
      placement={placement || "left-start"}
      disabled={disabled}
      content={<WidthBoundFieldInfo field={field} description={description} />}
      onTrigger={instance => {
        const fieldInfoPopovers = document.querySelectorAll(
          `.${className}[data-state~='visible']`,
        );

        // if a dimension info popovers are already visible, hide them and show this popover immediately
        if (fieldInfoPopovers.length > 0) {
          hideAll({
            exclude: instance,
          });
          instance.show();
        }
      }}
    >
      {children}
    </TippyPopover>
  );
}

FieldInfoPopover.propTypes = propTypes;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldInfoPopover;
