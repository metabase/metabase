import React from "react";
import styled from "styled-components";
import {
  SortableContainer as OriginalSortableContainer,
  SortableElement,
  SortableHandle,
} from "react-sortable-hoc";

const SortableContainerWrapper = styled.div`
  user-select: none;
`;

// Workaround for https://github.com/clauderic/react-sortable-hoc/issues/253
// See issue demo here: https://github.com/metabase/metabase/issues/12870
export function SortableContainer(WrappedComponent, config) {
  return OriginalSortableContainer(
    props => (
      <SortableContainerWrapper>
        <WrappedComponent {...props} />
      </SortableContainerWrapper>
    ),
    config,
  );
}

export { SortableElement, SortableHandle };
