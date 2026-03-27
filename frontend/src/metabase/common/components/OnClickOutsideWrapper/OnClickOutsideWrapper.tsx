import type { ReactNode } from "react";
import { Children, Component, createRef } from "react";

import {
  RENDERED_POPOVERS,
  removePopoverData,
  shouldClosePopover,
} from "metabase/common/hooks/use-sequenced-content-close-handler";
import { Box } from "metabase/ui";

interface OnClickOutsideWrapperProps {
  children: ReactNode;
  backdropElement?: Element;
  handleDismissal: () => void;
  ignoreElement?: Element;
}

interface PopoverData {
  contentEl: Element;
  backdropEl?: Element;
  close: (e: MouseEvent | KeyboardEvent) => void;
  ignoreEl?: Element;
}

export class OnClickOutsideWrapper extends Component<OnClickOutsideWrapperProps> {
  contentRef = createRef<HTMLDivElement>();
  _timeout: ReturnType<typeof setTimeout> | null = null;
  popoverData: PopoverData | null = null;

  componentDidMount() {
    // necessary to ignore click events that fire immediately, causing modals/popovers to close prematurely
    this._timeout = setTimeout(() => {
      const contentEl = this.contentRef.current;
      if (!contentEl) {
        return;
      }

      this.popoverData = {
        contentEl,
        backdropEl: this.props.backdropElement,
        close: () => this.props.handleDismissal(),
        ignoreEl: this.props.ignoreElement,
      };

      RENDERED_POPOVERS.push(this.popoverData);

      // HACK: set the z-index of the parent element to ensure it's always on top
      // NOTE: this actually doesn't seem to be working correctly for popovers since PopoverBody creates a stacking context
      (contentEl.parentNode as HTMLElement).style.zIndex = String(
        RENDERED_POPOVERS.length + 2,
      ); // HACK: add 2 to ensure it's in front of main and nav elements

      document.addEventListener("keydown", this._handleEvent, false);
      window.addEventListener("mousedown", this._handleEvent, true);
    }, 0);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this._handleEvent, false);
    window.removeEventListener("mousedown", this._handleEvent, true);
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    // remove from the stack after a delay, if it is removed through some other
    // means this will happen too early causing parent modal to close
    const popoverData = this.popoverData;
    setTimeout(() => {
      if (popoverData) {
        removePopoverData(popoverData);
      }
    }, 0);
  }

  _handleEvent = (e: KeyboardEvent | MouseEvent) => {
    if (this.popoverData && shouldClosePopover(e, this.popoverData)) {
      this.popoverData.close(e);
    }
  };

  render() {
    return (
      <Box ref={this.contentRef} display="contents">
        {Children.only(this.props.children)}
      </Box>
    );
  }
}
