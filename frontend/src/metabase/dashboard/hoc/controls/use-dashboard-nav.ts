import { useEffect } from "react";
import { useUnmount } from "react-use";

import HideS from "metabase/css/core/hide.module.css";

export const useDashboardNav = ({
  isFullscreen,
}: {
  isFullscreen: boolean;
}) => {
  const _showNav = (show: boolean) => {
    // NOTE Atte Keinänen 8/10/17: For some reason `document` object isn't present in Jest tests
    // when _showNav is called for the first time
    if (window.document) {
      const nav = document.body.querySelector(
        "[data-element-id='navbar-root']",
      );

      if (show && nav) {
        nav.classList.remove(HideS.hide);
      } else if (!show && nav) {
        nav.classList.add(HideS.hide);
      }
    }
  };

  useEffect(() => {
    _showNav(!isFullscreen);
  }, [isFullscreen]);

  useUnmount(() => {
    _showNav(true);
  });
};
