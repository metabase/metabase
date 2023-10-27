import PropTypes from "prop-types";
import cx from "classnames";
import styled from "@emotion/styled";
import {
  SortableContainer as OriginalSortableContainer,
  SortableElement,
  SortableHandle,
} from "react-sortable-hoc";
import "./sortable.css";

const SortableContainerWrapper = styled.div`
  user-select: none;
`;

// Workaround for https://github.com/clauderic/react-sortable-hoc/issues/253
// See issue demo here: https://github.com/metabase/metabase/issues/12870
export function SortableContainer(WrappedComponent, config) {
  const SortableList = OriginalSortableContainer(
    props => (
      <SortableContainerWrapper>
        <WrappedComponent {...props} />
      </SortableContainerWrapper>
    ),
    config,
  );

  // Makes sure the sortable-hoc always receives "react-sortable-hoc-helper" class
  // The class just applies a big z-index to the dragged item created by sortable-hoc
  // to prevent https://github.com/clauderic/react-sortable-hoc#item-disappearing-when-sorting--css-issues
  function SortableListWithDraggedItemVisibilityFix({ helperClass, ...props }) {
    return (
      <SortableList
        {...props}
        helperClass={cx("react-sortable-hoc-helper", helperClass)}
      />
    );
  }

  SortableListWithDraggedItemVisibilityFix.displayName =
    WrappedComponent.displayName;

  SortableListWithDraggedItemVisibilityFix.propTypes = {
    helperClass: PropTypes.string,
  };

  return SortableListWithDraggedItemVisibilityFix;
}

export { SortableElement, SortableHandle };
