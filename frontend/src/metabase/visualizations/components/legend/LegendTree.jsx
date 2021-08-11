import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import Legend from "./Legend";
import Popover from "metabase/components/Popover";

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array,
  visibleCount: PropTypes.number,
};

const LegendTree = ({ className, labels, visibleCount, ...otherProps }) => {
  const [target, setTarget] = useState();

  const visibleLabels = labels.slice(0, visibleCount);
  const overflowLabels = labels.slice(visibleLabels.length);
  const overflowCount = overflowLabels.length;

  const handleOpen = useCallback(event => {
    setTarget(event.target);
  }, []);

  const handleClose = useCallback(() => {
    setTarget(undefined);
  }, []);

  return (
    <>
      <Legend
        className={className}
        labels={visibleLabels}
        overflowCount={overflowCount}
        onOpenOverflow={handleOpen}
        {...otherProps}
      />
      {target && (
        <Popover target={target} onClose={handleClose}>
          <Legend labels={overflowLabels} {...otherProps} />
        </Popover>
      )}
    </>
  );
};

LegendTree.propTypes = propTypes;

export default LegendTree;
